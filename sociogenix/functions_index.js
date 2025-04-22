
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
const stripe = require('stripe')('YOUR_STRIPE_SECRET_KEY');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const ttsClient = new TextToSpeechClient();
const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const bucket = storage.bucket('YOUR_FIREBASE_STORAGE_BUCKET');

admin.initializeApp();
const db = admin.firestore();

// Social media API clients (mocked for brevity)
const REDDIT = { subreddit: () => ({ submit: async () => ({}) }) };
const YOUTUBE = { videos: () => ({ insert: async () => ({}) }) };
const INSTAGRAM = { video_upload: async () => ({}), photo_upload: async () => ({}), post: async () => ({}) };
const X_API_TOKEN = 'YOUR_X_BEARER_TOKEN';

// Self-vulnerability scanning (mock)
const scanVulnerabilities = () => ({ status: 'Scanned', issues: [] });

// Predictive model (mock)
const predictEngagement = (data) => data.map(() => Math.random());

// Trend scraping
exports.scrapeTrends = functions.pubsub.schedule('every 24 hours').onRun(async () => {
  const platforms = {
    instagram: { metrics: ['likes', 'comments', 'saves', 'shares'], content: ['reels', 'stories'] },
    threads: { metrics: ['likes', 'replies'], content: ['text'] },
    'x.com': { metrics: ['likes', 'retweets', 'replies'], content: ['threads', 'tweets'] },
    youtube: { metrics: ['watch_time', 'ctr'], content: ['shorts', 'videos'] },
    reddit: { metrics: ['upvotes', 'comments'], content: ['posts', 'amas'] },
    tiktok: { metrics: ['watch_time', 'completion_rate'], content: ['videos'] }
  };
  for (const [platform, config] of Object.entries(platforms)) {
    let data = { hashtags: [`#${platform}Trend1`, `#${platform}Trend2`, `#${platform}Trend3`], content_type: config.content[0] };
    await db.collection('trends').add({
      platform,
      trends: data.hashtags,
      content_type: data.content_type,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  return { status: 'Trends updated' };
});

// Connect account
exports.connect = functions.https.onRequest(async (req, res) => {
  const { user_id, platform, credentials } = req.body;
  await db.collection('accounts').doc(user_id).set({ [platform]: credentials }, { merge: true });
  res.json({ status: `${platform} connected` });
});

// Get connected accounts
exports.accounts = functions.https.onRequest(async (req, res) => {
  const user_id = req.query.user_id;
  const doc = await db.collection('accounts').doc(user_id).get();
  res.json({ accounts: doc.data() || {} });
});

// Stripe subscription
exports.subscribe = functions.https.onRequest(async (req, res) => {
  const { user_id, plan, payment_method } = req.body;
  try {
    const customer = await stripe.customers.create({
      email: `user${user_id}@example.com`,
      payment_method,
      invoice_settings: { default_payment_method: payment_method }
    });
    const planPrices = { pro: 'price_pro_monthly', business: 'price_business_monthly', agency: 'price_agency_monthly' };
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: planPrices[plan] }]
    });
    await db.collection('users').doc(user_id).set({
      subscription: plan,
      stripe_customer_id: customer.id
    }, { merge: true });
    res.json({ status: 'Subscribed', subscription_id: subscription.id });
  } catch (e) {
    res.json({ status: 'Error', error: e.message });
  }
});

// Cross-posting
exports.post = functions.https.onRequest(async (req, res) => {
  const { user_id, content, platforms = 'all', video_url = '', keywords } = req.body;
  const allPlatforms = platforms === 'all' ? ['instagram', 'threads', 'x.com', 'youtube', 'reddit', 'tiktok'] : platforms;
  const accounts = (await db.collection('accounts').doc(user_id).get()).data() || {};
  const results = [];

  for (const platform of allPlatforms) {
    if (!accounts[platform]) {
      results.push({ platform, status: 'Account not connected' });
      continue;
    }
    try {
      if (platform === 'instagram') {
        if (video_url) await INSTAGRAM.video_upload(video_url, `${content} ${keywords.join(' ')}`);
        else await INSTAGRAM.photo_upload('placeholder.jpg', `${content} ${keywords.join(' ')}`);
      } else if (platform === 'threads') {
        await INSTAGRAM.post(`${content} ${keywords.join(' ')}`);
      } else if (platform === 'x.com') {
        await axios.post('https://api.twitter.com/2/tweets', { text: `${content} ${keywords.join(' ')}` }, {
          headers: { Authorization: `Bearer ${X_API_TOKEN}` }
        });
      } else if (platform === 'youtube') {
        if (video_url) await YOUTUBE.videos().insert({
          part: 'snippet,status',
          resource: { snippet: { title: content.slice(0, 100), description: keywords.join(' ') }, status: { privacyStatus: 'public' } },
          media: { body: video_url }
        });
      } else if (platform === 'reddit') {
        await REDDIT.subreddit('socialmedia').submit({ title: content.slice(0, 100), text: keywords.join(' ') });
      } else if (platform === 'tiktok') {
        await axios.post('https://api.tiktok.com/mock/upload', { video_url, caption: `${content} ${keywords.join(' ')}` });
      }
      await db.collection('analytics').add({
        user_id,
        platform,
        engagement: 0,
        reach: 0,
        trends: keywords,
        likes: 0,
        comments: 0,
        shares: 0,
        ctr: 0,
        watch_time: 0,
        completion_rate: 0
      });
      results.push({ platform, status: 'Posted' });
    } catch (e) {
      results.push({ platform, status: `Error: ${e.message}` });
    }
  }
  res.json({ results });
});

// Admin: Traffic monitoring
exports.adminTraffic = functions.https.onRequest(async (req, res) => {
  const user_id = req.query.user_id;
  const user = await db.collection('users').doc(user_id).get();
  if (!user.exists || user.data().role !== 'admin') return res.json({ status: 'Unauthorized' });
  const snapshot = await db.collection('analytics').get();
  const traffic = {};
  snapshot.forEach(doc => {
    const data = doc.data();
    const platform = data.platform;
    if (!traffic[platform]) traffic[platform] = { total_engagement: 0, total_reach: 0, api_calls: 0 };
    traffic[platform].total_engagement += data.engagement || 0;
    traffic[platform].total_reach += data.reach || 0;
    traffic[platform].api_calls += 1;
  });
  res.json({ traffic: Object.entries(traffic).map(([platform, stats]) => ({ _id: platform, ...stats })) });
});

// Admin: Account monitoring
exports.adminAccounts = functions.https.onRequest(async (req, res) => {
  const user_id = req.query.user_id;
  const user = await db.collection('users').doc(user_id).get();
  if (!user.exists || user.data().role !== 'admin') return res.json({ status: 'Unauthorized' });
  const users = (await db.collection('users').get()).docs.map(doc => ({ user_id: doc.id, ...doc.data() }));
  const accounts = (await db.collection('accounts').get()).docs.map(doc => ({ user_id: doc.id, ...doc.data() }));
  res.json({ users, connected_accounts: accounts });
});

// Text-to-Speech
exports.tts = functions.https.onRequest(async (req, res) => {
  const { text } = req.body;
  try {
    const [response] = await ttsClient.synthesizeSpeech({
      input: { text },
      voice: { languageCode: 'en-US', name: 'en-US-Wavenet-D' },
      audioConfig: { audioEncoding: 'MP3' }
    });
    const file = bucket.file(`tts/${Date.now()}.mp3`);
    await file.save(response.audioContent);
    const [url] = await file.getSignedUrl({ action: 'read', expires: '2025-12-31' });
    res.json({ status: 'Audio generated', url });
  } catch (e) {
    res.json({ status: 'Error', error: e.message });
  }
});

// Analytics
exports.analytics = functions.https.onRequest(async (req, res) => {
  const { user_id, platform } = req.query;
  const snapshot = await db.collection('analytics').where('user_id', '==', user_id).where('platform', '==', platform).get();
  const data = snapshot.docs.map(doc => doc.data());
  const predictions = predictEngagement(data);
  const algoTips = {
    tiktok: 'Use trending sounds for FYP boost',
    instagram: 'Post Reels at 8 PM for max likes',
    youtube: 'Optimize thumbnails for high CTR',
    'x.com': 'Create reply-driven threads',
    reddit: 'Post during peak subreddit hours',
    threads: 'Use concise, trending text posts'
  };
  res.json(data.map((d, i) => ({
    engagement: d.engagement,
    reach: d.reach,
    trends: d.trends,
    prediction: predictions[i],
    summary: `Your ${platform} posts are ${predictions[i] > 0.7 ? 'hot' : 'steady'}!`,
    algorithm_tip: algoTips[platform] || 'Engage early for better reach'
  })));
});

// ROI
exports.roi = functions.https.onRequest(async (req, res) => {
  const { ad_spend, conversions, avg_sale } = req.body;
  const cost = parseFloat(ad_spend);
  const revenue = parseFloat(conversions) * parseFloat(avg_sale);
  const roi = cost > 0 ? (revenue - cost) / cost * 100 : 0;
  res.json({ roi, recommendation: roi > 50 ? 'Boost high-engagement posts' : 'Optimize ad targeting' });
});

// Trend alerts
exports.trendAlerts = functions.https.onRequest(async (req, res) => {
  const platform = req.query.platform;
  const snapshot = await db.collection('trends').where('platform', '==', platform).orderBy('timestamp', 'desc').limit(1).get();
  const trend = snapshot.docs[0]?.data() || { trends: [], content_type: 'post' };
  res.json({ alerts: trend.trends, content_type: trend.content_type });
});

// AMA scheduler
exports.amaSchedule = functions.https.onRequest(async (req, res) => {
  const { subreddit, time } = req.body;
  res.json({ status: `AMA scheduled for ${subreddit} at ${time}` });
});

// Security scan
exports.scan = functions.https.onRequest(async (req, res) => {
  res.json(scanVulnerabilities());
});

// Stripe webhook
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  try {
    const event = stripe.webhooks.constructEvent(req.rawBody, sig, 'YOUR_STRIPE_WEBHOOK_SECRET');
    if (event.type === 'invoice.paid') {
      const customerId = event.data.object.customer;
      await db.collection('users').where('stripe_customer_id', '==', customerId).get().then(snapshot => {
        snapshot.forEach(doc => doc.ref.update({ subscription: 'active' }));
      });
    }
    res.json({ received: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Expose all endpoints under /api
exports.api = functions.https.onRequest((req, res) => {
  const path = req.path.split('/')[2];
  if (path === 'connect') return exports.connect(req, res);
  if (path === 'accounts') return exports.accounts(req, res);
  if (path === 'subscribe') return exports.subscribe(req, res);
  if (path === 'post') return exports.post(req, res);
  if (path === 'admin/traffic') return exports.adminTraffic(req, res);
  if (path === 'admin/accounts') return exports.adminAccounts(req, res);
  if (path === 'tts') return exports.tts(req, res);
  if (path === 'analytics') return exports.analytics(req, res);
  if (path === 'roi') return exports.roi(req, res);
  if (path === 'trend_alerts') return exports.trendAlerts(req, res);
  if (path === 'ama_schedule') return exports.amaSchedule(req, res);
  if (path === 'scan') return exports.scan(req, res);
  res.status(404).json({ status: 'Not found' });
});

<script type="module">
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyA4a7PeU6HqIKWv37DXfrdoLOYhvcnVmtw",
    authDomain: "sociogenix-6f229.firebaseapp.com",
    projectId: "sociogenix-6f229",
    storageBucket: "sociogenix-6f229.firebasestorage.app",
    messagingSenderId: "979776731550",
    appId: "1:979776731550:web:d67a25614d1643a9583e8f",
    measurementId: "G-6E00FM91V2"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
</script>







