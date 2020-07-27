import { SplitFactory } from '../../';
import { splitFilters, queryStrings } from '../mocks/fetchSpecificSplits';
// import splitChangesMock1 from '../mocks/splitchanges.since.-1.json';

const baseConfig = {
  core: {
    authorizationKey: '<fake-token-push-1>',
    key: 'nicolas@split.io'
  },
  scheduler: {
    featuresRefreshRate: 0.01
  },
  streamingEnabled: false,
};

export default function fetchSpecificSplits(fetchMock, assert) {

  assert.plan(splitFilters.length);

  for (let i = 0; i < splitFilters.length; i++) {
    const urls = { sdk: 'https://sdkurl' + i };
    const queryString = queryStrings[i] ? '&' + queryStrings[i] : '';
    const config = { ...baseConfig, sync: { splitFilters: splitFilters[i] }, urls };
    let factory;

    fetchMock.getOnce(urls.sdk + '/splitChanges?since=-1' + queryString, { status: 200, body: { splits: [], since: -1, till: 1457552620999 } });
    fetchMock.getOnce(urls.sdk + '/splitChanges?since=1457552620999' + queryString, { status: 200, body: { splits: [], since: 1457552620999, till: 1457552620999 } });
    fetchMock.getOnce(urls.sdk + '/splitChanges?since=1457552620999' + queryString, function () {
      factory.client().destroy().then(() => {
        assert.pass(`splitFilters #${i}`);
      });
      return { status: 200, body: { splits: [], since: 1457552620999, till: 1457552620999 } };
    });
    fetchMock.get(urls.sdk + '/mySegments/nicolas@split.io', { status: 200, body: { 'mySegments': [] } });

    factory = SplitFactory(config);

  }
}