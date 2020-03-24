import SSEClient from '../SSEClient';
import authenticate from '../AuthClient';
import NotificationProcessorFactory from '../NotificationProcessor';
import logFactory from '../../utils/logger';
const log = logFactory('splitio-pushmanager');
import splitSyncFactory from '../SplitSync';
import segmentSyncFactory from '../SegmentSync';

/**
 * Factory of the push mode manager.
 *
 * @param {*} syncManager reference to syncManager for callback functions.
 *  interface syncManager {
 *    startPolling: () => void,
 *    stopPolling: () => void,
 *    syncAll: () => void,
 *  }
 * @param {*} context context of main client.
 * @param {*} producer producer of main client (/produce/node or /producer/browser/full).
 * @param {*} clients object with client information to handle mySegments synchronization. undefined for node.
 *  interface clients {
 *    userKeys: { [userKey: string]: string },
 *    userKeyHashes: { [userKeyHash: string]: string },
 *    clients: { [userKey: string]: Object },
 *  }
 */
export default function PushManagerFactory(syncManager, context, producer, clients) {

  // @TODO: check availability of EventSource, and base64 functions

  const sseClient = SSEClient.getInstance();

  // No return a PushManager if sseClient could not be created, due to the lack of EventSource API.
  if (!sseClient) {
    log.warn('EventSource API is not available. Fallback to polling mode');
    return undefined;
  }

  const settings = context.get(context.constants.SETTINGS);
  const storage = context.get(context.constants.STORAGE);

  /** Functions used to handle mySegments synchronization for browser */

  /** PushManager functions, according to the spec */

  function scheduleNextTokenRefresh(issuedAt, expirationTime) {
    // @REVIEW calculate delay. Currently set one minute less than delta.
    const delayInSeconds = expirationTime - issuedAt - 60;
    scheduleReconnect(delayInSeconds * 1000);
  }
  function scheduleNextReauth() {
    // @TODO calculate delay
    const delayInSeconds = 60;
    scheduleReconnect(delayInSeconds * 1000);
  }

  let timeoutID = 0;
  function scheduleReconnect(delayInMillis) {
    // @REVIEW is there some scenario where `clearScheduledReconnect` must be explicitly called?
    // cancel a scheduled reconnect if previously established, since `scheduleReconnect` is invoked on different scenarios:
    // - initial connect
    // - scheduled connects for refresh token, auth errors and sse errors.
    if (timeoutID) clearTimeout(timeoutID);
    timeoutID = setTimeout(() => {
      connectPush();
    }, delayInMillis);
  }

  function connectPush() {
    authenticate(settings, clients ? clients.userKeys : undefined).then(
      function (authData) {

        if (!authData.pushEnabled) {
          log.error('Streaming is not enabled for the organization. Switching to polling mode.');
          syncManager.startPolling(); // there is no need to close sseClient (it is not open on this scenario)
          return;
        }

        // Connect to SSE and schedule refresh token
        const decodedToken = authData.decodedToken;
        sseClient.open(authData);
        scheduleNextTokenRefresh(decodedToken.iat, decodedToken.exp);
      }
    ).catch(
      function (error) {
        if(error && error.statusCode) {
          switch(error.statusCode) {
            case 401:
              log.error(error.message);
              sseClient.close();
              syncManager.startPolling(); // we switch to polling, even knowing that the API Key is invalid.
              return;
          }
        }
        // Branch for timeout and other HTTP errors
        log.error(error);
        sseClient.close();
        scheduleNextReauth();
      }
    );
  }

  /** Functions related to synchronization according to the spec (Queues and Workers) */

  const splitSync = splitSyncFactory(storage.splits, producer);

  const segmentSync = clients ? segmentSyncFactory(clients.clients) : segmentSyncFactory(storage.segments, producer);

  /** initialization */

  const notificationProcessor = NotificationProcessorFactory({
    // SyncManager
    startPolling: syncManager.startPolling,
    stopPolling: syncManager.stopPolling,
    syncAll: syncManager.syncAll,
    // PushManager
    connectPush,
    // @TODO review if passing sseClient directly
    closeSSEconnection: sseClient.close.bind(sseClient),
    // SyncWorkers
    splitSync,
    segmentSync,
  }, clients ? clients.userKeyHashes : undefined);
  sseClient.setEventHandler(notificationProcessor);

  return {
    stopPush() { // same producer passed to NodePushManagerFactory
      // remove listener, so that when connection is closed, polling mode is not started.
      sseClient.setEventHandler(undefined);
      sseClient.close();
    },
    connectPush,
  };
}