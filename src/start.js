import './index.js';
import { startTikTokDetector } from './tiktok-detector.js';
import { startAntiSpam } from './anti-spam.js';
import { startVRMonitor } from './vr-monitor.js';
import { setupBotRole } from './bot-role.js';

startTikTokDetector();
startAntiSpam();
startVRMonitor();
setTimeout(() => setupBotRole(), 10000);
