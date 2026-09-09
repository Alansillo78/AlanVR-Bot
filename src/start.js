import './index.js';
import { startTikTokDetector } from './tiktok-detector.js';
import { startAntiSpam } from './anti-spam.js';
import { publishRules } from './rules.js';
import { startVRMonitor } from './vr-monitor.js';

startTikTokDetector();
startAntiSpam();
startVRMonitor();
setTimeout(() => publishRules(), 5000);
