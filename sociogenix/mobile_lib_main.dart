import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:charts_flutter/flutter.dart' as charts;
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:google_sign_in/google_sign_in.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  Stripe.publishableKey = 'YOUR_STRIPE_PUBLISHABLE_KEY';
  runApp(SocioGenixApp());
}

class SocioGenixApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SocioGenix',
      theme: ThemeData(primarySwatch: Colors.blue, visualDensity: VisualDensity.adaptivePlatformDensity),
      routes: {
        '/': (context) => DashboardScreen(),
        '/admin': (context) => AdminScreen(),
        '/subscribe': (context) => SubscribeScreen(),
      },
    );
  }
}

class DashboardScreen extends StatefulWidget {
  @override
  _DashboardScreenState createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  User? user;
  List<dynamic> analytics = [];
  List<String> alerts = [];
  String contentType = 'post';
  Map<String, dynamic>? roi;
  List<String> platforms = ['instagram', 'threads', 'x.com', 'youtube', 'reddit', 'tiktok'];
  String content = '';
  String videoUrl = '';
  String ttsText = '';
  String ttsUrl = '';
  List<dynamic> postResults = [];
  Map<String, dynamic> connectedAccounts = {};
  Map<String, dynamic> campaignData = {'ad_spend': 0, 'conversions': 0, 'avg_sale': 0};
  String userRole = 'user';
  final GoogleSignIn _googleSignIn = GoogleSignIn(scopes: ['https://www.googleapis.com/auth/youtube']);

  @override
  void initState() {
    super.initState();
    FirebaseAuth.instance.authStateChanges().listen((firebaseUser) async {
      setState(() => user = firebaseUser);
      if (firebaseUser != null) {
        final doc = await FirebaseFirestore.instance.collection('users').doc(firebaseUser.uid).get();
        setState(() => userRole = doc.data()?['role'] ?? 'user');
        fetchConnectedAccounts();
      }
    });
    loadCachedData();
    fetchAnalytics();
    fetchTrendAlerts();
  }

  Future<void> loadCachedData() async {
    final prefs = await SharedPreferences.getInstance();
    final cachedAnalytics = prefs.getString('analytics_instagram');
    if (cachedAnalytics != null) {
      setState(() {
        analytics = jsonDecode(cachedAnalytics);
      });
    }
  }

  Future<void> fetchAnalytics() async {
    try {
      final response = await http.get(Uri.parse('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/analytics?user_id=${user?.uid}&platform=instagram'));
      final data = jsonDecode(response.body);
      setState(() {
        analytics = data;
      });
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('analytics_instagram', jsonEncode(data));
    } catch (e) {
      print('Offline: $e');
    }
  }

  Future<void> fetchTrendAlerts() async {
    final response = await http.get(Uri.parse('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/trend_alerts?platform=instagram'));
    final data = jsonDecode(response.body);
    setState(() {
      alerts = List<String>.from(data['alerts']);
      contentType = data['content_type'];
    });
  }

  Future<void> fetchConnectedAccounts() async {
    try {
      final response = await http.get(Uri.parse('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/accounts?user_id=${user?.uid}'));
      setState(() {
        connectedAccounts = jsonDecode(response.body)['accounts'] ?? {};
      });
    } catch (e) {
      print('Error fetching accounts: $e');
    }
  }

  Future<void> connectAccount(String platform) async {
    try {
      final response = await http.get(Uri.parse('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/oauth/$platform?user_id=${user?.uid}&redirect_uri=https://YOUR_FIREBASE_PROJECT_ID.firebaseapp.com/oauth-callback'));
      final authUrl = jsonDecode(response.body)['authUrl'];
      if (await canLaunch(authUrl)) {
        await launch(authUrl);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Cannot launch $platform OAuth')));
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: ${e.toString()}')));
    }
  }

  Future<void> login() async {
    try {
      final googleUser = await _googleSignIn.signIn();
      if (googleUser == null) return;
      final googleAuth = await googleUser.authentication;
      final credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );
      await FirebaseAuth.instance.signInWithCredential(credential);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Login failed: $e')));
    }
  }

  Future<void> logout() async {
    await _googleSignIn.signOut();
    await FirebaseAuth.instance.signOut();
  }

  Future<void> postContent() async {
    final response = await http.post(
      Uri.parse('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/post'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'user_id': user?.uid,
        'platforms': platforms,
        'content': content,
        'video_url': videoUrl,
        'keywords': alerts,
      }),
    );
    setState(() {
      postResults = jsonDecode(response.body)['results'];
    });
  }

  Future<void> generateTts() async {
    final response = await http.post(
      Uri.parse('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/tts'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'text': ttsText}),
    );
    setState(() {
      ttsUrl = jsonDecode(response.body)['url'];
    });
  }

  Future<void> calculateRoi() async {
    final response = await http.post(
      Uri.parse('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/roi'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(campaignData),
    );
    setState(() {
      roi = jsonDecode(response.body);
    });
  }

  Future<void> scheduleAma() async {
    await http.post(
      Uri.parse('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/ama_schedule'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'subreddit': 'socialmedia', 'time': '2025-04-21 14:00'}),
    );
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('AMA Scheduled!')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('SocioGenix'),
        actions: [
          if (user != null)
            TextButton(onPressed: logout, child: const Text('Logout', style: TextStyle(color: Colors.white)))
          else
            TextButton(onPressed: login, child: const Text('Sign in with Google', style: TextStyle(color: Colors.white)))
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Connect Accounts', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: ['instagram', 'threads', 'x.com', 'youtube', 'reddit', 'tiktok'].map((p) => ElevatedButton(
                onPressed: connectedAccounts[p] != null ? null : () => connectAccount(p),
                child: Text(connectedAccounts[p] != null ? '${p} Connected (${connectedAccounts[p]['username']})' : 'Connect $p'),
              )).toList(),
            ),
            Text('Connected: ${connectedAccounts.keys.map((p) => '$p: ${connectedAccounts[p]['username'] ?? 'Connected'}').join(', ') ?? 'None'}'),
            const SizedBox(height: 16),
            const Text('Create Post', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            TextField(
              decoration: const InputDecoration(labelText: 'Write your post'),
              maxLines: 4,
              onChanged: (value) => setContent(value),
            ),
            TextField(
              decoration: const InputDecoration(labelText: 'Video URL (optional)'),
              onChanged: (value) => setVideoUrl(value),
            ),
            const SizedBox(height: 8),
            const Text('Select Platforms', style: TextStyle(fontSize: 16)),
            Wrap(
              spacing: 8,
              children: ['instagram', 'threads', 'x.com', 'youtube', 'reddit', 'tiktok'].map((p) => ChoiceChip(
                label: Text(p[0].toUpperCase() + p.substring(1)),
                selected: platforms.contains(p),
                onSelected: (selected) {
                  setState(() {
                    if (selected) {
                      platforms.add(p);
                    } else {
                      platforms.remove(p);
                    }
                  });
                },
              )).toList(),
            ),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Column(
                  children: [
                    Text('Trend Alerts: ${alerts.join(', ') ?? 'No alerts'}'),
                    Text('Algorithm Tip: ${analytics.isNotEmpty ? analytics[0]['algorithm_tip'] : 'Post early'}'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: postContent,
              child: const Text('Post Now'),
            ),
            ...postResults.map((r) => Text('${r['platform']}: ${r['status']}')),
            const SizedBox(height: 16),
            const Text('Text-to-Speech', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            TextField(
              decoration: const InputDecoration(labelText: 'Enter text for audio'),
              maxLines: 2,
              onChanged: (value) => setTtsText(value),
            ),
            ElevatedButton(
              onPressed: generateTts,
              child: const Text('Generate Audio'),
            ),
            if (ttsUrl.isNotEmpty) TextButton(onPressed: () => launchUrl(Uri.parse(ttsUrl)), child: Text('Download Audio')),
            const SizedBox(height: 16),
            const Text('Your Analytics', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            SizedBox(
              height: 200,
              child: charts.LineChart(
                [
                  charts.Series(
                    id: 'Engagement',
                    data: analytics,
                    domainFn: (dynamic d, _) => d['timestamp'] ?? 'N/A',
                    measureFn: (dynamic d, _) => d['engagement'] ?? 0,
                  ),
                ],
                animate: true,
              ),
            ),
            ...analytics.map((d) => Text('${d['summary']} (Prediction: ${d['prediction']?.toStringAsFixed(2) ?? 'N/A'})')),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: scheduleAma,
              child: const Text('Schedule AMA'),
            ),
            const SizedBox(height: 16),
            const Text('ROI Calculator', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            TextField(
              decoration: const InputDecoration(labelText: 'Ad Spend ($)'),
              keyboardType: TextInputType.number,
              onChanged: (value) => campaignData['ad_spend'] = double.tryParse(value) ?? 0,
            ),
            TextField(
              decoration: const InputDecoration(labelText: 'Conversions'),
              keyboardType: TextInputType.number,
              onChanged: (value) => campaignData['conversions'] = double.tryParse(value) ?? 0,
            ),
            TextField(
              decoration: const InputDecoration(labelText: 'Avg Sale ($)'),
              keyboardType: TextInputType.number,
              onChanged: (value) => campaignData['avg_sale'] = double.tryParse(value) ?? 0,
            ),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: calculateRoi,
              child: const Text('Calculate'),
            ),
            if (roi != null) Text('ROI: ${roi!['roi'].toStringAsFixed(2)}% - ${roi!['recommendation']}'),
            if (userRole == 'admin')
              ElevatedButton(
                onPressed: () => Navigator.pushNamed(context, '/admin'),
                child: const Text('Admin Dashboard'),
              ),
            ElevatedButton(
              onPressed: () => Navigator.pushNamed(context, '/subscribe'),
              child: const Text('Subscribe'),
            ),
          ],
        ),
      ),
    );
  }
}

class AdminScreen extends StatefulWidget {
  @override
  _AdminScreenState createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  List<dynamic> traffic = [];
  Map<String, dynamic> adminAccounts = {'users': [], 'connected_accounts': []};
  List<Map<String, String>> posts = [
    {'id': '1', 'content': 'Sample post'}
  ];

  @override
  void initState() {
    super.initState();
    fetchTraffic();
    fetchAccounts();
  }

  Future<void> fetchTraffic() async {
    final response = await http.get(Uri.parse('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/admin/traffic?user_id=${FirebaseAuth.instance.currentUser?.uid}'));
    setState(() {
      traffic = jsonDecode(response.body)['traffic'];
    });
  }

  Future<void> fetchAccounts() async {
    final response = await http.get(Uri.parse('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/admin/accounts?user_id=${FirebaseAuth.instance.currentUser?.uid}'));
    setState(() {
      adminAccounts = jsonDecode(response.body);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('SocioGenix Admin')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Traffic Monitoring', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            SizedBox(
              height: 200,
              child: charts.BarChart(
                [
                  charts.Series(
                    id: 'Engagement',
                    data: traffic,
                    domainFn: (dynamic d, _) => d['_id'],
                    measureFn: (dynamic d, _) => d['total_engagement'],
                  ),
                ],
                animate: true,
              ),
            ),
            ...traffic.map((t) => Text('${t['_id']}: Engagement: ${t['total_engagement']}, Reach: ${t['total_reach']}, API Calls: ${t['api_calls']}')),
            const SizedBox(height: 16),
            const Text('Account Monitoring', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            Text('Users: ${adminAccounts['users'].map((u) => 'ID: ${u['user_id']}, Plan: ${u['subscription'] ?? 'Free'}').join(', ')}'),
            Text('Connected Accounts: ${adminAccounts['connected_accounts'].map((a) => '${a['user_id']}: ${a.keys.where((k) => k != 'user_id').join(', ')}').join('; ')}'),
            const SizedBox(height: 16),
            const Text('Schedule Posts', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            ...posts.map((post) => Draggable<Map<String, String>>(
              data: post,
              feedback: Material(child: Text(post['content']!)),
              child: Card(child: Padding(padding: const EdgeInsets.all(8), child: Text(post['content']!))),
            )),
            DragTarget<Map<String, String>>(
              builder: (context, candidateData, rejectedData) => Container(
                height: 200,
                color: candidateData.isNotEmpty ? Colors.blue[100] : Colors.grey[200],
                child: const Center(child: Text('Drop posts here')),
              ),
              onAccept: (post) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Scheduled: ${post['content']}'))),
            ),
          ],
        ),
      ),
    );
  }
}

class SubscribeScreen extends StatefulWidget {
  @override
  _SubscribeScreenState createState() => _SubscribeScreenState();
}

class _SubscribeScreenState extends State<SubscribeScreen> {
  CardFieldInputDetails? cardDetails;

  Future<void> subscribe(String plan) async {
    if (cardDetails?.complete ?? false) {
      final response = await http.post(
        Uri.parse('https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net/api/subscribe'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'user_id': FirebaseAuth.instance.currentUser?.uid, 'plan': plan, 'payment_method': 'pm_card_visa'}),
      );
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(jsonDecode(response.body)['status'])));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Subscribe to SocioGenix')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            CardField(
              onCardChanged: (card) => setState(() => cardDetails = card),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: cardDetails?.complete ?? false ? () => subscribe('pro') : null,
              child: const Text('Pro ($19/month)'),
            ),
            ElevatedButton(
              onPressed: cardDetails?.complete ?? false ? () => subscribe('business') : null,
              child: const Text('Business ($59/month)'),
            ),
            ElevatedButton(
              onPressed: cardDetails?.complete ?? false ? () => subscribe('agency') : null,
              child: const Text('Agency ($249/month)'),
            ),
          ],
        ),
      ),
    );
  }
}
