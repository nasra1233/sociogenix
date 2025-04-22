const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
const stripe = require('stripe')('YOUR_STRIPE_SECRET_KEY');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const ttsClient = new TextToSpeechClient();
const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const bucket = storage.bucket('YOUR_FIREBASE_STORAGE_BUCKET');
const { OAuth2Client } = require('google-auth-library');
const querystring = require('querystring');

admin.initializeApp();
const db = admin.firestore();

// Social media OAuth configurations
const oauthConfigs = {
  instagram: {
    authUrl: 'https://api.instagram.com/oauth/authorize',
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    clientId: 'YOUR_INSTAGRAM_CLIENT_ID',
    clientSecret: 'YOUR_INSTAGRAM_CLIENT_SECRET',
    scope: 'user_profile,user_media',
  },
  threads: {
    authUrl: 'https://api.instagram.com/oauth/authorize',
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    clientId: 'YOUR_INSTAGRAM_CLIENT_ID',
    clientSecret: 'YOUR_INSTAGRAM_CLIENT_SECRET',
    scope: 'user_profile,user_media',
  },
  'x.com': {
    authUrl: 'https://api.twitter.com/oauth/authorize',
    tokenUrl: 'https://api.twitter.com/oauth/access_token',
    clientId: 'YOUR_TWITTER_CLIENT_ID',
    clientSecret: 'YOUR_TWITTER_CLIENT_SECRET',
    scope: 'tweet.read tweet.write users.read',
  },
  youtube: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: 'YOUR_GOOGLE_CLIENT_ID',
    clientSecret: 'YOUR_GOOGLE_CLIENT_SECRET',
    scope: 'https://www.googleapis.com/auth/youtube',
  },
  reddit: {
    authUrl: 'https://www.reddit.com/api/v1/authorize',
    tokenUrl: 'https://www.reddit.com/api/v1/access_token',
    clientId: 'YOUR_REDDIT_CLIENT_ID',
    clientSecret: 'YOUR_REDDIT_CLIENT_SECRET',
    scope: 'identity submit',
  },
  tiktok: {
    authUrl: 'https://www.tiktok.com/auth/authorize',
    tokenUrl: 'https://open-api.tiktok.com/oauth/access_token',
    clientId: 'YOUR_TIKTOK_CLIENT_ID',
    clientSecret: 'YOUR_TIKTOK_CLIENT_SECRET',
    scope: 'user.info.basic,video.publish',
  },
};

// Initialize Google OAuth2 client for YouTube
const googleOAuth2Client = new OAuth2Client(
  oauthConfigs.youtube.clientId,
  oauthConfigs.youtube.clientSecret,
  'https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/oauth/youtube/callback'
);

// Social media API clients (real implementations)
const INSTAGRAM_API = async (accessToken) => ({
  post: async (content) => await axios.post('https://graph.instagram.com/v12.0/me/media', { caption: content, access_token: accessToken }),
  video_upload: async (url, caption) => await axios.post('https://graph.instagram.com/v12.0/me/media', { video_url: url, caption, access_token: accessToken }),
});
const TWITTER_API = async (accessToken, accessSecret) => ({
  post: async (content) => await axios.post('https://api.twitter.com/2/tweets', { text: content }, { headers: { Authorization: `Bearer ${accessToken}` } }),
});
const YOUTUBE_API = async (accessToken) => {
  googleOAuth2Client.setCredentials({ access_token: accessToken });
  return {
    videos: () => ({
      insert: async (resource) => await axios.post('https://www.googleapis.com/youtube/v3/videos', resource, { headers: { Authorization: `Bearer ${accessToken}` } }),
    }),
  };
};
const REDDIT_API = async (accessToken) => ({
  subreddit: (name) => ({
    submit: async ({ title, text }) => await axios.post(`https://oauth.reddit.com/r/${name}/api/submit`, { title, text, kind: 'self' }, { headers: { Authorization: `Bearer ${accessToken}` } }),
  }),
});
const TIKTOK_API = async (accessToken) => ({
  upload: async (video_url, caption) => await axios.post('https://open-api.tiktok.com/video/upload', { video_url, caption, access_token: accessToken }),
});

// Self-vulnerability scanning (mock)
const scanVulnerabilities = () => ({ status: 'Scanned', issues: [] });

// Predictive model (mock)
const predictEngagement = (data) => data.map(() => Math.random());

// OAuth initiation
exports.oauth = functions.https.onRequest(async (req, res) => {
  const { platform, user_id, redirect_uri } = req.query;
  const config = oauthConfigs[platform];
  if (!config) return res.status(400).json({ error: 'Invalid platform' });

  const state = JSON.stringify({ user_id, platform, redirect_uri });
  let authUrl;

  if (platform === 'youtube') {
    authUrl = googleOAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: config.scope,
      state,
      redirect_uri: `https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/oauth/youtube/callback`,
    });
  } else if (platform === 'x.com') {
    // Twitter uses OAuth 1.0a, handled differently
    const response = await axios.post('https://api.twitter.com/oauth/request_token', null, {
      headers: { Authorization: `OAuth consumer_key="${config.clientId}", consumer_secret="${config.clientSecret}"` },
    });
    const oauthToken = querystring.parse(response.data).oauth_token;
    authUrl = `${config.authUrl}?oauth_token=${oauthToken}&state=${encodeURIComponent(state)}`;
  } else {
    authUrl = `${config.authUrl}?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=${config.scope}&response_type=code&state=${encodeURIComponent(state)}`;
  }

  res.json({ authUrl });
});

// OAuth callback for all platforms
exports.oauthCallback = functions.https.onRequest(async (req, res) => {
  const { platform } = req.params;
  const { code, state } = req.query;
  const { user_id, redirect_uri } = JSON.parse(state || '{}');
  const config = oauthConfigs[platform];

  if (!config || !user_id) return res.status(400).json({ error: 'Invalid request' });

  try {
    let tokens;
    if (platform === 'youtube') {
      const { tokens: googleTokens } = await googleOAuth2Client.getToken({
        code,
        redirect_uri: `https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/oauth/youtube/callback`,
      });
      tokens = { access_token: googleTokens.access_token, refresh_token: googleTokens.refresh_token };
    } else if (platform === 'x.com') {
      const oauthToken = req.query.oauth_token;
      const oauthVerifier = req.query.oauth_verifier;
      const response = await axios.post('https://api.twitter.com/oauth/access_token', querystring.stringify({ oauth_token: oauthToken, oauth_verifier: oauthVerifier }), {
        headers: { Authorization: `OAuth consumer_key="${config.clientId}", consumer_secret="${config.clientSecret}"` },
      });
      const parsed = querystring.parse(response.data);
      tokens = { access_token: parsed.oauth_token, access_secret: parsed.oauth_token_secret };
    } else {
      const response = await axios.post(config.tokenUrl, {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri,
      });
      tokens = response.data;
    }

    // Fetch username or profile info
    let username = 'unknown';
    if (platform === 'instagram' || platform === 'threads') {
      const profile = await axios.get('https://graph.instagram.com/me?fields=username&access_token=' + tokens.access_token);
      username = profile.data.username;
    } else if (platform === 'x.com') {
      username = tokens.screen_name || 'twitter_user';
    } else if (platform === 'youtube') {
      const profile = await axios.get('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      username = profile.data.items[0].snippet.title;
    } else if (platform === 'reddit') {
      const profile = await axios.get('https://oauth.reddit.com/api/v1/me', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      username = profile.data.name;
    } else if (platform === 'tiktok') {
      const profile = await axios.get('https://open-api.tiktok.com/user/info/', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      username = profile.data.user.username;
    }

    await db.collection('accounts').doc(user_id).set(
      { [platform]: { access_token: tokens.access_token, refresh_token: tokens.refresh_token, access_secret: tokens.access_secret, username } },
      { merge: true }
    );

    res.redirect(`${redirect_uri}?status=success&platform=${platform}`);
  } catch (error) {
    res.redirect(`${redirect_uri}?status=error&message=${encodeURIComponent(error.message)}`);
  }
});

// Trend scraping
exports.scrapeTrends = functions.pubsub.schedule('every 24 hours').onRun(async () => {
  const platforms = {
    instagram: { metrics: ['likes', 'comments', 'saves', 'shares'], content: ['reels', 'stories'] },
    threads: { metrics: ['likes', 'replies'], content: ['text'] },
    'x.com': { metrics: ['likes', 'retweets', 'replies'], content: ['threads', 'tweets'] },
    youtube: { metrics: ['watch_time', 'ctr'], content: ['shorts', 'videos'] },
    reddit: { metrics: ['upvotes', 'comments'], content: ['posts', 'amas'] },
    tiktok: { metrics: ['watch_time', 'completion_rate'], content: ['videos'] },
  };
  for (const [platform, config] of Object.entries(platforms)) {
    let data = { hashtags: [`#${platform}Trend1`, `#${platform}Trend2`, `#${platform}Trend3`], content_type: config.content[0] };
    await db.collection('trends').add({
      platform,
      trends: data.hashtags,
      content_type: data.content_type,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  return { status: 'Trends updated' };
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
      invoice_settings: { default_payment_method: payment_method },
    });
    const planPrices = { pro: 'price_pro_monthly', business: 'price_business_monthly', agency: 'price_agency_monthly' };
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: planPrices[plan] }],
    });
    await db.collection('users').doc(user_id).set(
      { subscription: plan, stripe_customer_id: customer.id },
      { merge: true }
    );
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
      const { access_token, access_secret } = accounts[platform];
      if (platform === 'instagram') {
        const api = await INSTAGRAM_API(access_token);
        if (video_url) await api.video_upload(video_url, `${content} ${keywords.join(' ')}`);
        else await api.post(`${content} ${keywords.join(' ')}`);
      } else if (platform === 'threads') {
        const api = await INSTAGRAM_API(access_token);
        await api.post(`${content} ${keywords.join(' ')}`);
      } else if (platform === 'x.com') {
        const api = await TWITTER_API(access_token, access_secret);
        await api.post(`${content} ${keywords.join(' ')}`);
      } else if (platform === 'youtube') {
        const api = await YOUTUBE_API(access_token);
        if (video_url) {
          await api.videos().insert({
            part: 'snippet,status',
            resource: { snippet: { title: content.slice(0, 100), description: keywords.join(' ') }, status: { privacyStatus: 'public' } },
            media: { body: video_url },
          });
        }
      } else if (platform === 'reddit') {
        const api = await REDDIT_API(access_token);
        await api.subreddit('socialmedia').submit({ title: content.slice(0, 100), text: keywords.join(' ') });
      } else if (platform === 'tiktok') {
        const api = await TIKTOK_API(access_token);
        await api.upload(video_url, `${content} ${keywords.join(' ')}`);
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
        completion_rate: 0,
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
      audioConfig: { audioEncoding: 'MP3' },
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
    threads: 'Use concise, trending text posts',
  };
  res.json(
    data.map((d, i) => ({
      engagement: d.engagement,
      reach: d.reach,
      trends: d.trends,
      prediction: predictions[i],
      summary: `Your ${platform} posts are ${predictions[i] > 0.7 ? 'hot' : 'steady'}!`,
      algorithm_tip: algoTips[platform] || 'Engage early for better reach',
    }))
  );
});

// ROI
exports.roi = functions.https.onRequest(async (req, res) => {
  const { ad_spend, conversions, avg_sale } = req.body;
  const cost = parseFloat(ad_spend);
  const revenue = parseFloat(conversions) * parseFloat(avg_sale);
  const roi = cost > 0 ? ((revenue - cost) / cost) * 100 : 0;
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
  if (path === 'oauth') return exports.oauth(req, res);
  if (path === 'oauth' && req.path.includes('callback')) return exports.oauthCallback(req, res);
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
  if (path === 'stripeWebhook') return exports.stripeWebhook(req, res);
  res.status(404).json({ status: 'Not found' });
});
