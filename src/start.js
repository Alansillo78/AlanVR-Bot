import './index.js';
import { startTikTokDetector } from './tiktok-detector.js';
import { startAntiSpam } from './anti-spam.js';
import { publishRules } from './rules.js';

startTikTokDetector();
startAntiSpam();
setTimeout(() => publishRules(), 5000);
