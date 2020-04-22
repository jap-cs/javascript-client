import Backoff from '../../utils/backoff';

/**
 * SegmentUpdateWorker class
 */
export default class SegmentUpdateWorker {

  /**
   * @param {Object} segmentsStorage
   * @param {Object} segmentsProducer
   */
  constructor(segmentsStorage, segmentsProducer) {
    this.segmentsStorage = segmentsStorage;
    this.segmentsProducer = segmentsProducer;
    this.maxChangeNumbers = {};
    this.backoff = new Backoff(this.__handleSegmentUpdateCall.bind(this));
  }

  // Private method
  // Preconditions: this.segmentsProducer.isSynchronizingSegments === false
  __handleSegmentUpdateCall() {
    const segmentsToFetch = Object.keys(this.maxChangeNumbers).filter((segmentName) => {
      return this.maxChangeNumbers[segmentName] > this.segmentsStorage.getChangeNumber(segmentName);
    });
    if (segmentsToFetch.length > 0) {
      this.newEvent = false;
      this.segmentsProducer.synchronizeSegment(segmentsToFetch).then(() => {
        if (this.newEvent) {
          this.__handleSegmentUpdateCall();
        } else {
          this.backoff.scheduleCall();
        }
      });
    }
  }

  /**
   * Invoked by NotificationProcessor on SEGMENT_UPDATE event
   *
   * @param {number} changeNumber change number of the SEGMENT_UPDATE notification
   * @param {string} segmentName segment name of the SEGMENT_UPDATE notification
   */
  put(changeNumber, segmentName) {
    const currentChangeNumber = this.segmentsStorage.getChangeNumber(segmentName);

    if (changeNumber <= currentChangeNumber || changeNumber <= this.maxChangeNumbers[segmentName]) return;

    this.maxChangeNumbers[segmentName] = changeNumber;
    this.newEvent = true;
    this.backoff.reset();

    if (this.segmentsProducer.isSynchronizingSegments()) return;

    this.__handleSegmentUpdateCall();
  }

}