import './index.js';
import { startTikTokDetector } from './tiktok-detector.js';
import { startAntiSpam } from './anti-spam.js';
import { publishRules } from './rules.js';
import { startVRMonitor } from './vr-monitor.js';
import { setupSponsorChannels } from './sponsor-channels.js';

startTikTokDetector();
startAntiSpam();
startVRMonitor();
setTimeout(() => publishRules(), 5000);
setTimeout(() => setupSponsorChannels(), 8000);
