import React, { useState, useEffect } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import { Container, Grid, Paper, Typography, Button, TextField, Tooltip, Select, MenuItem, Checkbox, ListItemText } from '@mui/material';
import Chart from 'chart.js/auto';
import axios from 'axios';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import firebase from 'firebase/app';
import 'firebase/auth';
import 'firebase/firestore';

const stripePromise = loadStripe('YOUR_STRIPE_PUBLISHABLE_KEY');
firebase.initializeApp({
  apiKey: 'YOUR_FIREBASE_API_KEY',
  authDomain: 'YOUR_FIREBASE_AUTH_DOMAIN',
  projectId: 'YOUR_FIREBASE_PROJECT_ID',
  storageBucket: 'YOUR_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'YOUR_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'YOUR_FIREBASE_APP_ID'
});
const db = firebase.firestore();
const auth = firebase.auth();

const DraggablePost = ({ post }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'post',
    item: { post },
    collect: (monitor) => ({ isDragging: !!monitor.isDragging() })
  }));
  return (
    <Paper ref={drag} sx={{ p: 2, mb: 1, opacity: isDragging ? 0.5 : 1 }}>
      {post.content}
    </Paper>
  );
};

const DropCalendar = ({ onDrop }) => {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'post',
    drop: (item) => onDrop(item.post),
    collect: (monitor) => ({ isOver: !!monitor.isOver() })
  }));
  return (
    <Paper ref={drop} sx={{ p: 3, minHeight: 200, backgroundColor: isOver ? '#e0f7fa' : '#fff' }}>
      <Typography>Drop posts here to schedule</Typography>
    </Paper>
  );
};

const CheckoutForm = () => {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements) return;
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: 'http://localhost:3000/success' }
    });
    if (error) setError(error.message);
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <Button type="submit" variant="contained" sx={{ mt: 2 }} disabled={!stripe}>
        Subscribe
      </Button>
      {error && <Typography color="error">{error}</Typography>}
    </form>
  );
};

const App = () => {
  const [user, setUser] = useState(null);
  const [analytics, setAnalytics] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [contentType, setContentType] = useState('post');
  const [roi, setRoi] = useState(null);
  const [platform, setPlatform] = useState('all');
  const [platforms, setPlatforms] = useState(['instagram', 'threads', 'x.com', 'youtube', 'reddit', 'tiktok']);
  const [content, setContent] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [ttsText, setTtsText] = useState('');
  const [ttsUrl, setTtsUrl] = useState('');
  const [postResults, setPostResults] = useState([]);
  const [connectedAccounts, setConnectedAccounts] = useState({});
  const [traffic, setTraffic] = useState([]);
  const [adminAccounts, setAdminAccounts] = useState({ users: [], connected_accounts: [] });
  const [campaignData, setCampaignData] = useState({ ad_spend: 0, conversions: 0, avg_sale: 0 });
  const [userRole, setUserRole] = useState('user');
  const [posts, setPosts] = useState([{ id: 1, content: 'Sample post' }]);

  useEffect(() => {
    auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const userDoc = await db.collection('users').doc(firebaseUser.uid).get();
        setUserRole(userDoc.data()?.role || 'user');
      } else {
        setUser(null);
        setUserRole('user');
      }
    });

    axios.get(`https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/analytics?user_id=1&platform=${platform === 'all' ? 'instagram' : platform}`)
      .then(res => setAnalytics(res.data));
    axios.get(`https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/trend_alerts?platform=${platform === 'all' ? 'instagram' : platform}`)
      .then(res => {
        setAlerts(res.data.alerts);
        setContentType(res.data.content_type);
      });
    axios.get('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/accounts?user_id=1')
      .then(res => setConnectedAccounts(res.data.accounts));
    if (userRole === 'admin') {
      axios.get('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/admin/traffic?user_id=1')
        .then(res => setTraffic(res.data.traffic));
      axios.get('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/admin/accounts?user_id=1')
        .then(res => setAdminAccounts(res.data));
    }
    const ctx = document.getElementById('analyticsChart')?.getContext('2d');
    if (ctx) {
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: analytics.map(d => d.timestamp || 'N/A'),
          datasets: [{ label: 'Engagement', data: analytics.map(d => d.engagement || 0), borderColor: '#1976d2' }]
        },
        options: { scales: { y: { beginAtZero: true } } }
      });
    }
  }, [platform, analytics, userRole]);

  const login = () => auth.signInWithEmailAndPassword('user@example.com', 'password');
  const logout = () => auth.signOut();

  const connectAccount = (platform) => {
    const credentials = prompt(`Enter ${platform} credentials (OAuth token or username:password)`);
    if (credentials) {
      axios.post('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/connect', {
        user_id: user.uid,
        platform,
        credentials
      }).then(res => {
        alert(res.data.status);
        axios.get('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/accounts?user_id=1')
          .then(res => setConnectedAccounts(res.data.accounts));
      });
    }
  };

  const postContent = () => {
    axios.post('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/post', {
      user_id: user.uid,
      platforms: platform,
      content,
      video_url: videoUrl,
      keywords: alerts
    }).then(res => setPostResults(res.data.results));
  };

  const subscribe = (plan) => {
    axios.post('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/subscribe', {
      user_id: user.uid,
      plan,
      payment_method: 'pm_card_visa'
    }).then(res => alert(res.data.status));
  };

  const generateTts = () => {
    axios.post('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/tts', { text: ttsText })
      .then(res => setTtsUrl(res.data.url));
  };

  const calculateRoi = () => {
    axios.post('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/roi', campaignData).then(res => setRoi(res.data));
  };

  const scheduleAma = () => {
    axios.post('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/ama_schedule', { subreddit: 'socialmedia', time: '2025-04-21 14:00' })
      .then(res => alert(res.data.status));
  };

  const handleDrop = (post) => {
    alert(`Scheduled post: ${post.content}`);
  };

  const AdminDashboard = () => (
    <DndProvider backend={HTML5Backend}>
      <Typography variant="h6">Admin Dashboard</Typography>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6">Traffic Monitoring</Typography>
        <canvas id="trafficChart" height="200"></canvas>
        {traffic.map((t, i) => (
          <Typography key={i}>
            {t._id}: Engagement: {t.total_engagement}, Reach: {t.total_reach}, API Calls: {t.api_calls}
          </Typography>
        ))}
      </Paper>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6">Account Monitoring</Typography>
        <Typography>Users: {adminAccounts.users.map(u => `ID: ${u.user_id}, Plan: ${u.subscription || 'Free'}`).join(', ')}</Typography>
        <Typography>Connected Accounts: {adminAccounts.connected_accounts.map(a => `${a.user_id}: ${Object.keys(a).filter(k => k !== '_id' && k !== 'user_id').join(', ')}`).join('; ')}</Typography>
      </Paper>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6">Schedule Posts</Typography>
        {posts.map(post => <DraggablePost key={post.id} post={post} />)}
        <DropCalendar onDrop={handleDrop} />
      </Paper>
    </DndProvider>
  );

  return (
    <Router>
      <Container sx={{ py: 4 }}>
        <Typography variant="h4" color="primary" gutterBottom>SocioGenix Dashboard</Typography>
        {user ? (
          <Button onClick={logout}>Logout</Button>
        ) : (
          <Button onClick={login}>Login</Button>
        )}
        <Switch>
          <Route path="/admin">
            {userRole === 'admin' ? <AdminDashboard /> : <Typography>Unauthorized</Typography>}
          </Route>
          <Route path="/subscribe">
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6">Subscribe to SocioGenix</Typography>
              <Elements stripe={stripePromise}>
                <CheckoutForm />
              </Elements>
              <Button variant="contained" onClick={() => subscribe('pro')} sx={{ m: 1 }}>Pro ($19/month)</Button>
              <Button variant="contained" onClick={() => subscribe('business')} sx={{ m: 1 }}>Business ($59/month)</Button>
              <Button variant="contained" onClick={() => subscribe('agency')} sx={{ m: 1 }}>Agency ($249/month)</Button>
            </Paper>
          </Route>
          <Route path="/">
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6">Connect Accounts</Typography>
              <Grid container spacing={2}>
                {['instagram', 'threads', 'x.com', 'youtube', 'reddit', 'tiktok'].map(p => (
                  <Grid item key={p}>
                    <Tooltip title={`Connect your ${p} account!`}>
                      <Button
                        variant="outlined"
                        onClick={() => connectAccount(p)}
                        disabled={connectedAccounts[p]}
                      >
                        {connectedAccounts[p] ? `${p} Connected` : `Connect ${p}`}
                      </Button>
                    </Tooltip>
                  </Grid>
                ))}
              </Grid>
              <Typography variant="body1" sx={{ mt: 2 }}>
                Connected: {Object.keys(connectedAccounts).map(p => `${p}: ${connectedAccounts[p]}`).join(', ') || 'None'}
              </Typography>
            </Paper>
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6">Create Post</Typography>
              <TextField
                label="Write your post"
                multiline
                rows={4}
                fullWidth
                value={content}
                onChange={e => setContent(e.target.value)}
                sx={{ mb: 2 }}
              />
              <TextField
                label="Video URL (optional)"
                fullWidth
                value={videoUrl}
                onChange={e => setVideoUrl(e.target.value)}
                sx={{ mb: 2 }}
              />
              <Select
                multiple
                value={platforms}
                onChange={e => setPlatforms(e.target.value)}
                renderValue={selected => selected.join(', ')}
                sx={{ mb: 2, width: '100%' }}
              >
                {['instagram', 'threads', 'x.com', 'youtube', 'reddit', 'tiktok'].map(p => (
                  <MenuItem key={p} value={p}>
                    <Checkbox checked={platforms.includes(p)} />
                    <ListItemText primary={p.charAt(0).toUpperCase() + p.slice(1)} />
                  </MenuItem>
                ))}
              </Select>
              <Typography variant="body1">Trend Alerts: {alerts.join(', ') || 'No alerts'}</Typography>
              <Typography variant="body1">Algorithm Tip: {analytics[0]?.algorithm_tip || 'Post early for better reach'}</Typography>
              <Tooltip title="Share to all selected platforms!">
                <Button variant="contained" onClick={postContent} sx={{ mt: 2 }}>Post Now</Button>
              </Tooltip>
              {postResults.map((r, i) => (
                <Typography key={i}>{r.platform}: {r.status}</Typography>
              ))}
            </Paper>
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6">Text-to-Speech</Typography>
              <TextField
                label="Enter text for audio"
                multiline
                rows={2}
                fullWidth
                value={ttsText}
                onChange={e => setTtsText(e.target.value)}
                sx={{ mb: 2 }}
              />
              <Button variant="contained" onClick={generateTts} sx={{ mb: 2 }}>Generate Audio</Button>
              {ttsUrl && <a href={ttsUrl} download>Download Audio</a>}
            </Paper>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6">Your Analytics</Typography>
                  <canvas id="analyticsChart" height="200"></canvas>
                  {analytics.map((d, i) => (
                    <Typography key={i}>{d.summary} (Prediction: {d.prediction?.toFixed(2) || 'N/A'})</Typography>
                  ))}
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <DndProvider backend={HTML5Backend}>
                  <Paper sx={{ p: 3 }}>
                    <Typography variant="h6">Schedule Posts</Typography>
                    <Typography color="textSecondary">Drag your {contentType} to the calendar!</Typography>
                  </Paper>
                </DndProvider>
              </Grid>
              <Grid item xs={12}>
                <Paper sx={{ p: 3 }}>
                  <Tooltip title="Join our Reddit AMA!">
                    <Button variant="contained" onClick={scheduleAma} sx={{ mt: 2 }}>Schedule AMA</Button>
                  </Tooltip>
                </Paper>
              </Grid>
              <Grid item xs={12}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6">ROI Calculator</Typography>
                  <TextField
                    label="Ad Spend ($)"
                    type="number"
                    onChange={e => setCampaignData({ ...campaignData, ad_spend: parseFloat(e.target.value) || 0 })}
                    sx={{ m: 1 }}
                  />
                  <TextField
                    label="Conversions"
                    type="number"
                    onChange={e => setCampaignData({ ...campaignData, conversions: parseFloat(e.target.value) || 0 })}
                    sx={{ m: 1 }}
                  />
                  <TextField
                    label="Avg Sale ($)"
                    type="number"
                    onChange={e => setCampaignData({ ...campaignData, avg_sale: parseFloat(e.target.value) || 0 })}
                    sx={{ m: 1 }}
                  />
                  <Button variant="contained" onClick={calculateRoi} sx={{ m: 1 }}>Calculate</Button>
                  {roi && <Typography>ROI: {roi.roi.toFixed(2)}% - {roi.recommendation}</Typography>}
                </Paper>
              </Grid>
            </Grid>
          </Route>
        </Switch>
      </Container>
    </Router>
  );
};

export default App;
