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
    this.segmentsChangesQueue = [];
  }

  // Private method
  // Preconditions: this.segmentsProducer.isSynchronizingSegments === false
  __handleSegmentUpdateCall() {
    if (this.segmentsChangesQueue.length > 0) {
      const { changeNumber, segmentName } = this.segmentsChangesQueue[this.segmentsChangesQueue.length - 1];
      if (changeNumber > this.segmentsStorage.getChangeNumber(segmentName)) {
        this.segmentsProducer.synchronizeSegment(segmentName).then(() => {
          this.__handleSegmentUpdateCall();
        });
      } else {
        this.segmentsChangesQueue.pop();
        this.__handleSegmentUpdateCall();
      }
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

    if (changeNumber <= currentChangeNumber) return;

    this.segmentsChangesQueue.push({ segmentName, changeNumber });

    if (this.segmentsProducer.isSynchronizingSegments()) return;

    this.__handleSegmentUpdateCall();
  }

}