/**
 * oli b, ditchLabs, 2024
 * singleton instance of blesession
 */

import { BLESession } from './BLESession.js';

const bleSessionInstance = new BLESession();
export { bleSessionInstance };