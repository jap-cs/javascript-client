import logFactory from '../../utils/logger';
import { uniq, isObject, isString } from '../../utils/lang';
import { SPLIT_IMPRESSION, SPLIT_EVENT } from '../../utils/constants';
const log = logFactory('splitio-split-to-ga');

class SplitToGa {

  static defaultFilter() { return true; }

  static defaultMapper({ type, payload }) {
    switch (type) {
      case SPLIT_IMPRESSION:
        return {
          hitType: 'event',
          eventCategory: 'split-impression',
          eventAction: payload.impression.feature,
          eventLabel: payload.impression.treatment,
          nonInteraction: true,
        };
      case SPLIT_EVENT:
        return {
          hitType: 'event',
          eventCategory: 'split-event',
          eventAction: payload.eventTypeId,
          eventValue: payload.value,
          nonInteraction: true,
        };
    }
    return null;
  }

  static getGa() {
    return typeof window !== 'undefined' ? window[window['GoogleAnalyticsObject'] || 'ga'] : undefined;
  }

  /**
   * Validates if a given object is a UniversalAnalytics.FieldsObject instance, and logs a warning if not.
   *
   * @param {UniversalAnalytics.FieldsObject} fieldsObject object to validate.
   * @returns {boolean} Whether the data instance is a valid FieldsObject or not.
   */
  static validateFieldsObject(fieldsObject) {
    if (isObject(fieldsObject) && isString(fieldsObject.hitType))
      return true;

    log.warn('your custom mapper returned an invalid FieldsObject instance. It must be an object with at least a `hitType` field.');
    return false;
  }

  constructor(options) {

    // Check if `ga` object is available
    if (typeof SplitToGa.getGa() !== 'function') {
      // @TODO review the following warning message
      log.warn('`ga` command queue not found. No hits will be sent.');
      // Return an empty object to avoid creating a SplitToGa instance 
      return {};
    }

    this.filter = options && typeof (options.filter) === 'function' ?
      options.filter :
      SplitToGa.defaultFilter;

    // @TODO Should we check something else about `configObject.impressionMapper`? 
    // It doesn't matter, because if the returned object is not a GA fieldsObject or string, ga send command will do nothing.
    this.mapper = options && typeof (options.mapper) === 'function' ?
      options.mapper :
      SplitToGa.defaultMapper;

    this.trackerNames = options && Array.isArray(options.trackerNames) ?
      // We strip off duplicated values if we received a `trackerNames` param. 
      // We don't warn if a tracker does not exist, since the user might create it after the SDK is initialized.
      // Note: GA allows to create and get trackers using a string or number as tracker name, and does nothing if other types are used.
      uniq(options.trackerNames) :
      SplitToGa.defaultTrackerNames;
  }

  queue(data) {
    try {
      // filter and map Split events/impressions into a FieldsObject instance
      const fieldsObject = this.filter(data) && this.mapper(data);

      // don't send the hit if it is falsy or invalid when generated by a custom mapper
      if (!fieldsObject || (this.mapper !== SplitToGa.defaultMapper && !SplitToGa.validateFieldsObject(fieldsObject)))
        return;

      // send the hit
      this.trackerNames.forEach(trackerName => {
        const sendCommand = trackerName ? `${trackerName}.send` : 'send';
        // access ga command queue via `getGa` method, accounting for the possibility that 
        // the global `ga` reference was not yet mutated by analytics.js.
        SplitToGa.getGa()(sendCommand, fieldsObject);
      });
    } catch (err) {
      log.warn(`SplitToGa queue method threw: ${err}. No hit was sent.`);
    }
  }

}

// A falsy object represents the default tracker
SplitToGa.defaultTrackerNames = [''];

export default SplitToGa;