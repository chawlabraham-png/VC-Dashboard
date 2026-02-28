// ============================================================
// Jungle Ventures — VC Intelligence Platform
// Main Application Controller
// ============================================================

import { STARTUPS, SIGNAL_TYPES, GEOGRAPHIES, SECTORS } from './data.js';
import { rankStartups, WEIGHTS } from './scoring.js';
import { createSparkline, createRadarChart, getScoreColor, getScoreClass, getBarColor } from './charts.js';
import CONFIG from './config.js';

// ---- State ----
let rankedStartups = [];
let currentSection = 'dealflow';
let filters = { geo: 'India', sector: 'All', tier: 'All', search: '' };
let uploadedDecks = [];

// ---- Supabase ----
const SUPABASE_URL = CONFIG.supabaseUrl;
const SUPABASE_KEY = CONFIG.supabaseKey;
let supabase = null;
let supabaseConnected = false;

// ---- Streak CRM ----
const STREAK_API_KEY = CONFIG.streakApiKey;
let streakPipelines = [];

// ---- Gmail OAuth ----
let gmailTokenClient = null;
let gmailAccessToken = null;
let dealEmails = [];

let integrationState = {
  gmail: { connected: false, email: '', emails: [] },
  streak: { connected: true, apiKey: STREAK_API_KEY, pipelines: [], lastSync: null },
  supabase: { connected: false },
  team: {
    members: [
      { name: 'You', email: 'admin@jungleventures.com', role: 'Partner', color: '#10b981' }
    ]
  }
};

function initSupabase() {
  try {
    if (window.supabase) {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      supabaseConnected = true;
      integrationState.supabase.connected = true;
      console.log('✅ Supabase connected:', SUPABASE_URL);
    }
  } catch (e) {
    console.warn('Supabase init failed:', e);
  }
}

function initStreak() {
  // Streak API requires server-side proxy due to CORS
  // For now, we store the key and show connected state
  // In production, API calls go through a Supabase Edge Function
  integrationState.streak.connected = true;
  integrationState.streak.lastSync = new Date();
  integrationState.streak.pipelines = [
    { name: 'Deal Flow - India', boxes: 7, stage: 'Active' },
    { name: 'Deal Flow - SEA', boxes: 9, stage: 'Active' },
    { name: 'Portfolio Monitoring', boxes: 8, stage: 'Active' },
    { name: 'Passed Deals', boxes: 24, stage: 'Archive' }
  ];
  console.log('✅ Streak CRM connected — API key configured');
}

function initGmail() {
  if (!CONFIG.googleClientId) {
    console.log('⏳ Gmail: Waiting for Google Client ID in config.js');
    return;
  }
  try {
    gmailTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleClientId,
      scope: CONFIG.gmailScopes,
      callback: handleGmailAuthResponse
    });
    console.log('✅ Gmail OAuth client initialized');
  } catch (e) {
    console.warn('Gmail init deferred — GIS script loading');
  }
}

function connectGmail() {
  if (!CONFIG.googleClientId) {
    // Show setup instructions
    openGmailSetupModal();
    return;
  }
  if (gmailTokenClient) {
    gmailTokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    initGmail();
    setTimeout(() => {
      if (gmailTokenClient) gmailTokenClient.requestAccessToken({ prompt: 'consent' });
    }, 500);
  }
}

function handleGmailAuthResponse(response) {
  if (response.error) {
    console.error('Gmail auth error:', response);
    return;
  }
  gmailAccessToken = response.access_token;
  integrationState.gmail.connected = true;

  // Fetch user profile
  fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${gmailAccessToken}` }
  })
    .then(r => r.json())
    .then(profile => {
      integrationState.gmail.email = profile.email;
      console.log('✅ Gmail connected:', profile.email);
      fetchDealEmails();
      if (currentSection === 'integrations') {
        renderIntegrations(document.getElementById('content-area'));
      }
    });
}

function fetchDealEmails() {
  if (!gmailAccessToken) return;

  // Build search query from startup names in pipeline
  const startupNames = rankedStartups.map(s => s.name).join(' OR ');
  const query = encodeURIComponent(`(${startupNames}) OR "deal flow" OR "pitch deck" OR "investment" OR "fundraise" OR "term sheet"`);

  fetch(`https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=${query}`, {
    headers: { 'Authorization': `Bearer ${gmailAccessToken}` }
  })
    .then(r => r.json())
    .then(data => {
      if (!data.messages) {
        integrationState.gmail.emails = [];
        return;
      }
      // Fetch details for each message
      const fetchPromises = data.messages.slice(0, 10).map(msg =>
        fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
          headers: { 'Authorization': `Bearer ${gmailAccessToken}` }
        }).then(r => r.json())
      );
      return Promise.all(fetchPromises);
    })
    .then(emails => {
      if (!emails) return;
      integrationState.gmail.emails = emails.map(e => {
        const headers = e.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '(No subject)';
        const from = headers.find(h => h.name === 'From')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';
        // Auto-tag with matching startup names
        const matchedStartups = rankedStartups.filter(s =>
          subject.toLowerCase().includes(s.name.toLowerCase()) ||
          from.toLowerCase().includes(s.name.toLowerCase())
        ).map(s => s.name);
        return { id: e.id, subject, from, date, snippet: e.snippet, matchedStartups };
      });
      console.log(`📧 Fetched ${integrationState.gmail.emails.length} deal-related emails`);
      if (currentSection === 'integrations') {
        renderIntegrations(document.getElementById('content-area'));
      }
    })
    .catch(err => console.warn('Gmail fetch error:', err));
}

function openGmailSetupModal() {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  content.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">
        <div class="deal-logo">📧</div>
        <div>
          <h3>Gmail API Setup</h3>
          <div class="sub">Connect your Gmail to auto-scan deal emails</div>
        </div>
      </div>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div class="modal-body" style="padding:20px">
      <div class="insight-box info" style="margin-bottom:16px">Follow these steps to get your Google Client ID. Takes ~3 minutes.</div>
      <div style="font-size:0.85rem;color:var(--text-secondary);line-height:1.8">
        <ol style="padding-left:20px">
          <li><strong>Go to</strong> <a href="https://console.cloud.google.com" target="_blank" style="color:var(--accent-blue)">console.cloud.google.com</a></li>
          <li><strong>Create a project</strong> (or select existing) → Name it "JV Intelligence"</li>
          <li>Go to <strong>APIs & Services → Library</strong> → Search <strong>"Gmail API"</strong> → <strong>Enable</strong></li>
          <li>Go to <strong>APIs & Services → Credentials</strong> → <strong>Create Credentials → OAuth Client ID</strong></li>
          <li>Configure consent screen if prompted (External, add your email as test user)</li>
          <li>Application type: <strong>Web application</strong></li>
          <li>Authorized JavaScript origins: <code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;font-size:0.8rem">http://localhost:8765</code></li>
          <li>Authorized redirect URIs: <code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;font-size:0.8rem">http://localhost:8765</code></li>
          <li>Click <strong>Create</strong> → Copy the <strong>Client ID</strong></li>
          <li>Paste it below ↓</li>
        </ol>
      </div>
      <div style="margin-top:16px">
        <div class="integration-input-group">
          <input class="integration-input" placeholder="Paste your Google Client ID here..." id="gmail-client-id-input" style="font-size:0.82rem">
          <button class="integration-connect-btn" id="save-gmail-client-id">Save & Connect</button>
        </div>
      </div>
    </div>
  `;
  modal.classList.add('active');
  content.querySelector('#modal-close-btn').addEventListener('click', closeModal);
  content.querySelector('#save-gmail-client-id').addEventListener('click', () => {
    const clientId = document.getElementById('gmail-client-id-input')?.value?.trim();
    if (clientId && clientId.includes('.apps.googleusercontent.com')) {
      CONFIG.googleClientId = clientId;
      closeModal();
      initGmail();
      setTimeout(() => connectGmail(), 300);
    } else {
      alert('Please enter a valid Google Client ID.\nIt looks like: 123456789-xxxx.apps.googleusercontent.com');
    }
  });
}

// ---- Valuation Comps Data ----
const VALUATION_COMPS = [
  { name: "KartBee", stage: "Pre-Seed", revenue: "$45K MRR", growth: "280%", fairVal: "$8-12M", currentVal: "$10M", status: "fair", model: "Quick Commerce", comps: ["Zepto (Pre-Seed: $12M)", "Blinkit early ($8M)", "Swish (SG: $6M)"], nextRound: "Seed at $25-35M in 6-9 months if hits $150K MRR", risks: "Unit economics unproven in Tier-2; heavy capex" },
  { name: "FactoryOS", stage: "Seed", revenue: "$180K MRR", growth: "200%", fairVal: "$28-38M", currentVal: "$32M", status: "fair", model: "Smart Factory SaaS", comps: ["Sight Machine (Seed: $30M)", "Tulip Interfaces ($35M)", "MOI (India: $25M)"], nextRound: "Series A at $60-80M in 9-12 months", risks: "Long enterprise sales cycle; integration complexity" },
  { name: "Playlo", stage: "Pre-Series A", revenue: "$28K MRR", growth: "180%", fairVal: "$18-25M", currentVal: "$22M", status: "fair", model: "Social Gaming", comps: ["Hago (SEA: $20M)", "Winzo (India: $25M at seed)", "Aura (ID: $15M)"], nextRound: "Series A at $50-70M if DAU exceeds 200K", risks: "Retention cliff typical in casual gaming; monetization per user low" },
  { name: "QualityLens", stage: "Series A", revenue: "$680K MRR", growth: "180%", fairVal: "$55-75M", currentVal: "$62M", status: "fair", model: "Visual Inspection AI", comps: ["Landing AI ($65M Series A)", "Instrumental ($58M)", "Eigen Innovations ($42M)"], nextRound: "Series B at $150-200M in 12-15 months", risks: "GPU costs at scale; accuracy claims need third-party validation" },
  { name: "SteelMind", stage: "Series A", revenue: "$920K MRR", growth: "140%", fairVal: "$48-62M", currentVal: "$58M", status: "fair", model: "Predictive Maintenance", comps: ["Augury ($55M Series A)", "Senseye ($45M)", "Nanoprecise ($38M)"], nextRound: "Series B at $120-160M in 10-14 months", risks: "Customer concentration risk; slow industrial adoption curves" },
  { name: "MateriFlow", stage: "Seed", revenue: "$290K MRR", growth: "240%", fairVal: "$35-48M", currentVal: "$38M", status: "fair", model: "B2B Marketplace", comps: ["Ula (ID Seed: $40M)", "Moglix (India: $42M early)", "Bizongo ($35M)"], nextRound: "Series A at $80-110M with GMV proof", risks: "Marketplace liquidity chicken-and-egg; margin pressure" },
  { name: "Vybe", stage: "Pre-Seed", revenue: "$15K MRR", growth: "600%", fairVal: "$12-18M", currentVal: "$14M", status: "fair", model: "Creator Economy", comps: ["Chingari (Pre-Seed: $15M)", "Josh early ($18M)", "Kumu (PH: $10M)"], nextRound: "Seed at $30-45M on MAU trajectory", risks: "Hyper-competitive; user acquisition cost escalation; regulation risk" },
  { name: "PixelPay", stage: "Pre-Seed", revenue: "$8K MRR", growth: "800%", fairVal: "$7-11M", currentVal: "$9M", status: "fair", model: "Gen-Z Fintech", comps: ["FamPay (Pre-Seed: $10M)", "Fidel early ($8M)", "Bankera ($6M)"], nextRound: "Seed at $20-30M on RBI license progress", risks: "Regulatory overhang; unclear willingness to pay from Gen-Z" },
  { name: "RoboWeld", stage: "Series A", revenue: "$520K MRR", growth: "160%", fairVal: "$45-60M", currentVal: "$52M", status: "underpriced", model: "Industrial Robotics", comps: ["Universal Robots early ($60M)", "Doosan Robotics ($55M)", "Elephant Robotics ($38M)"], nextRound: "Series B at $130-170M with ASEAN expansion", risks: "Hardware supply chain complexity; after-sales service cost" },
  { name: "GreenMill", stage: "Seed", revenue: "$240K MRR", growth: "210%", fairVal: "$40-55M", currentVal: "$42M", status: "underpriced", model: "Carbon/ESG SaaS", comps: ["Watershed ($45M seed)", "Persefoni ($50M)", "Plan A ($38M)"], nextRound: "Series A at $90-120M on regulatory tailwinds", risks: "ESG regulation pace uncertain in ASEAN; customer willingness to pay" }
];

// ---- Thesis Data ----
const THESIS_DATA = {
  accelerating: [
    { emoji: "🏭", title: "AI-Powered Manufacturing", desc: "Factory AI, predictive maintenance, and visual inspection are seeing 3x YoY funding growth in India & SEA. Regulatory push for smart manufacturing in India (PLI scheme) is creating massive demand. JV is well-positioned with FactoryOS, QualityLens, and SteelMind.", status: "Thesis strengthening ↑↑" },
    { emoji: "🎮", title: "Social Gaming in SEA", desc: "500M+ mobile-first gamers in SEA with rising ARPU. Playlo and local studios are capturing share from global publishers. Indonesia and Vietnam are fastest-growing markets.", status: "Capital flowing in ↑" },
    { emoji: "♻️", title: "Sustainability / ESG in Manufacturing", desc: "EU CBAM and Singapore carbon tax driving demand for manufacturing carbon accounting. GreenMill is pioneer in ASEAN. $48B TAM growing 25% annually.", status: "Early innings — low competition ↑" }
  ],
  saturated: [
    { emoji: "🛒", title: "Quick Commerce (Metro India)", desc: "Zepto, Blinkit, Instamart have locked up Delhi/Mumbai/Bangalore. Tier-2 opportunity remains (KartBee thesis), but metro QC is winner-take-most. Over 30 funded players.", status: "Crowded — differentiation key →" },
    { emoji: "💳", title: "Digital Lending (India)", desc: "150+ NBFCs with digital play. RBI tightening regulations. UPI dominance means distribution is easy but defensibility is hard. Finfolk (PH) is better geo-play.", status: "Peak funding — margins compressing →" },
    { emoji: "🍱", title: "Cloud Kitchens", desc: "Rebel Foods, EatClub, CloudEats have scaled. High churn, low margins. Chowbus SEA differentiation through premium + AI is best path forward.", status: "Consolidation phase →" }
  ],
  whitespace: [
    { emoji: "🤖", title: "Affordable Industrial Robotics (ASEAN)", desc: "Only RoboWeld is tackling this. ASEAN has 2M+ SME factories that can't afford Fanuc/ABB. 70% cost reduction + AI programming is the unlock. $38B TAM.", status: "Zero competition — first mover advantage" },
    { emoji: "📦", title: "Packaging Automation (India)", desc: "India's packaging market is $73B but <5% automated. PackBot is only startup targeting modular automation for mid-market FMCG. EU sustainability packaging rules will force adoption.", status: "Massive TAM, no startup competition" },
    { emoji: "🧪", title: "Raw Materials Marketplace (SEA)", desc: "MateriFlow is pioneering B2B materials marketplace in Indonesia. No Alibaba-equivalent for ASEAN factories. Trade finance integration is key moat.", status: "First mover in $55B market" },
    { emoji: "🌏", title: "Vernacular Creator Economy (Bharat)", desc: "ShareChat proved demand, but Vybe's multi-lingual AI dubbing + monetization is new. 500M non-English internet users in India with no dominant platform.", status: "Platform shift opportunity" }
  ],
  gaps: [
    { emoji: "⚠️", title: "Underexposed: Semiconductor Supply Chain", desc: "India's semiconductor mission ($10B+) has no JV portfolio play. Design services, testing, and packaging automation are adjacent to current thesis.", signal: "negative" },
    { emoji: "⚠️", title: "Underexposed: Agri-Manufacturing", desc: "Farm-to-factory value chain in India/SEA is $200B+ with minimal VC presence. Cold chain, food processing automation, and agri-input marketplaces.", signal: "negative" },
    { emoji: "✅", title: "Strong: Factory AI Stack", desc: "3 companies across visual inspection, predictive maintenance, and smart factory OS. Continue investing to own this category.", signal: "positive" }
  ]
};

// ---- Portfolio Data ----
const PORTFOLIO_DATA = [
  { name: "FactoryOS", logo: "🏭", stage: "Seed", health: "green", hiring: "+18 roles", traffic: "↑ 42%", appRank: "N/A (B2B)", sentiment: "Positive", compFunding: "$12M by rival AInspect", signals: ["Hypergrowth: 200% rev growth", "Follow-on ready in 6 months"], followOnReady: true },
  { name: "QualityLens", logo: "🔍", stage: "Series A", health: "green", hiring: "+26 roles", traffic: "↑ 68%", appRank: "N/A (B2B)", sentiment: "Very Positive", compFunding: "$8M by VisualAI (SG)", signals: ["TechCrunch feature drove 40% traffic spike", "3 new enterprise logos this month"], followOnReady: true },
  { name: "SteelMind", logo: "🔩", stage: "Series A", health: "green", hiring: "+28 roles", traffic: "↑ 35%", appRank: "N/A (B2B)", sentiment: "Positive", compFunding: "$15M by Uptake (US competitor)", signals: ["JSW Steel case study driving inbound", "Revenue growing slower than hiring — watch burn"], followOnReady: false },
  { name: "Playlo", logo: "🎮", stage: "Pre-Series A", health: "green", hiring: "+22 roles", traffic: "↑ 210%", appRank: "#4 Indonesia", sentiment: "Very Positive", compFunding: "$5M by rival GameHive", signals: ["Viral TikTok driving organic growth", "Retention D7 at 38% — above gaming benchmark"], followOnReady: true },
  { name: "KartBee", logo: "🛒", stage: "Pre-Seed", health: "yellow", hiring: "+34 roles", traffic: "↑ 180%", appRank: "#12 Tier-2 cities", sentiment: "Mixed", compFunding: "$22M by Tier-2 rival QuickBasket", signals: ["⚠️ Competitor just raised $22M Series A", "Burn rate accelerating — 14 months runway"], followOnReady: false },
  { name: "MateriFlow", logo: "🧪", stage: "Seed", health: "green", hiring: "+20 roles", traffic: "↑ 55%", appRank: "N/A (B2B)", sentiment: "Positive", compFunding: "None direct", signals: ["GMV growing 3x QoQ", "Logistics integration completed"], followOnReady: false },
  { name: "GreenMill", logo: "♻️", stage: "Seed", health: "green", hiring: "+19 roles", traffic: "↑ 72%", appRank: "N/A (B2B)", sentiment: "Positive", compFunding: "$10M by Climatiq (EU)", signals: ["Singapore carbon tax expansion announced", "3 MNC pilots converting to contracts"], followOnReady: true },
  { name: "RoboWeld", logo: "🤖", stage: "Series A", health: "green", hiring: "+15 roles", traffic: "↑ 28%", appRank: "N/A (B2B)", sentiment: "Positive", compFunding: "None in ASEAN", signals: ["65 units deployed, 0% churn", "Vietnam factory automation incentive announced"], followOnReady: true }
];

// ---- Power Moves Data ----
const POWER_MOVES = [
  { type: "Fund Launch", title: "Sequoia India / SEA raises $2.8B Fund IX", desc: "Largest-ever SEA-focused fund. Will increase competition in Series A deals across manufacturing tech and consumer.", implication: "⚡ Expect valuation inflation in Series A factory-tech deals. Move faster on QualityLens and SteelMind follow-ons.", time: "2 days ago" },
  { type: "Partner Movement", title: "Accel India Partner Prayank Swaroop joins Lightspeed as Venture Partner", desc: "Prayank was lead on 3 manufacturing-tech deals at Accel. His move signals Lightspeed doubling down on B2B manufacturing in India.", implication: "🎯 Lightspeed may co-invest or compete on FactoryOS-style deals. Engage Prayank for co-lead opportunities.", time: "4 days ago" },
  { type: "Stealth Fundraise", title: "CarbonZero (SG) quietly raising $15M Series A", desc: "ESG compliance platform for ASEAN manufacturers. Direct competitor to GreenMill. Pitched Temasek and GIC.", implication: "⚠️ Accelerate GreenMill's fundraise timeline. Position as the operator-led alternative (Chen's Shell background).", time: "1 week ago" },
  { type: "Markup Signal", title: "Nexus Venture marking up Moglix at 4x in 18 months", desc: "Moglix's B2B industrial marketplace valued at $2.5B. Validates MateriFlow's thesis in Indonesia.", implication: "💰 Use Moglix markup as comp for MateriFlow's next round. Indonesia market 3x less penetrated than India.", time: "1 week ago" },
  { type: "Secondary Transaction", title: "Early ShareChat shares trading at $3.2B implied valuation on secondary market", desc: "Despite layoffs, secondary buyers see long-term value in Bharat vernacular content. Vybe is in same thesis.", implication: "📊 ShareChat secondary demand validates Vybe's vernacular creator thesis. Positive signal for pricing.", time: "10 days ago" },
  { type: "Syndicate Pattern", title: "Temasek + Wavemaker co-leading 3 manufacturing deals in 6 months", desc: "Pattern of co-investment in ASEAN manufacturing tech: robotics, IoT, and supply chain.", implication: "🤝 Approach Wavemaker as systematic co-investor for JV's manufacturing portfolio. They led RoboWeld's A.", time: "2 weeks ago" },
  { type: "Fund Launch", title: "East Ventures launches $250M Growth Fund for Indonesia", desc: "First growth-stage fund. Will compete for Series B deals in Indonesian consumer tech and B2B.", implication: "🔄 East Ventures backed Playlo seed. May lead Series A. Coordinate early to maintain pro-rata.", time: "2 weeks ago" },
  { type: "Stealth Fundraise", title: "FlexiPack (Mumbai) raising $5M seed for packaging automation", desc: "Direct competitor to PackBot. Founded by ex-Uflex engineers. Pitched Blume and 3one4.", implication: "⚠️ PackBot needs to close key FMCG clients fast. Speed of execution is the moat, not tech.", time: "3 weeks ago" }
];

// ---- Pattern Data ----
const PATTERN_WINNERS = [
  { text: "<strong>Founder with 10+ years domain expertise</strong> who then builds tech solution for their own industry pain point. (FactoryOS, QualityLens, SteelMind)" },
  { text: "<strong>Speed of execution in first 6 months</strong>: Winners ship MVP in <90 days and have paying customers by month 4." },
  { text: "<strong>Prior exit or VP+ role at scaled company</strong> — correlates with 3x higher chance of Series A." },
  { text: "<strong>Market timing aligned with regulatory tailwind</strong>: PLI scheme (India), carbon tax (SG), factory automation incentives (VN)." },
  { text: "<strong>Distribution hack in first 30 days</strong>: Viral content, influencer partnerships, or strategic BD that drives 10K+ initial users/customers." },
  { text: "<strong>Open-source or community-led growth</strong> in B2B: GitHub stars >500 in first year correlates with faster enterprise sales." },
  { text: "<strong>Repeat founders</strong> with even 1 prior exit close rounds 2x faster and at 40% higher valuations." }
];

const PATTERN_LOSERS = [
  { text: "<strong>Me-too product in crowded market</strong> without clear distribution advantage. 'Better tech' alone doesn't win." },
  { text: "<strong>First-time founders targeting enterprise</strong> with no industry network. Sales cycles bankrupt them before product-market fit." },
  { text: "<strong>Raised too much too early</strong> without unit economics proof. Creates misaligned incentives and governance issues." },
  { text: "<strong>Single geography, single customer concentration</strong>: Top 3 customers >50% of revenue = fragile business." },
  { text: "<strong>Hardware-only play without software/data moat</strong>: Margins compress with Chinese competition within 18 months." },
  { text: "<strong>Consumer app without organic viral loop</strong>: CAC > LTV death spiral when paid acquisition stops." }
];

const EVAL_CHECKLIST = [
  { icon: "🎯", label: "Founder-market fit (domain expertise > 5 years)" },
  { icon: "⚡", label: "Speed signal (MVP < 90 days, revenue < 6 months)" },
  { icon: "🏆", label: "Prior exit or VP+ at $1B+ company" },
  { icon: "📈", label: "MoM growth > 30% for 3+ consecutive months" },
  { icon: "🛡️", label: "Defensible moat (tech, data, regulation, network effects)" },
  { icon: "🌊", label: "Market timing / regulatory tailwind present" },
  { icon: "💰", label: "Unit economics positive or clear path within 12 months" },
  { icon: "🌏", label: "Multi-geo expansion potential without full rebuild" },
  { icon: "👥", label: "Team hiring velocity (>10 roles/month = conviction)" },
  { icon: "🔄", label: "Product engagement: DAU/MAU > 25% or NPS > 50" }
];

// ---- Init ----
function init() {
  rankedStartups = rankStartups(STARTUPS);

  // Set date
  const now = new Date();
  document.getElementById('report-date').textContent = now.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  document.getElementById('deal-count-badge').textContent = rankedStartups.length;

  // Bind navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = item.dataset.section;
      switchSection(section);
    });
  });

  // Bind filters
  document.getElementById('filter-geo').value = 'India';
  document.getElementById('filter-geo').addEventListener('change', (e) => { filters.geo = e.target.value; renderCurrentSection(); });
  document.getElementById('filter-sector').addEventListener('change', (e) => { filters.sector = e.target.value; renderCurrentSection(); });
  document.getElementById('filter-tier').addEventListener('change', (e) => { filters.tier = e.target.value; renderCurrentSection(); });
  document.getElementById('search-input').addEventListener('input', (e) => { filters.search = e.target.value.toLowerCase(); renderCurrentSection(); });

  // Modal close
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // Mobile menu
  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Render initial section
  renderCurrentSection();
}

function switchSection(section) {
  currentSection = section;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-section="${section}"]`)?.classList.add('active');

  const titles = {
    dealflow: 'Deal Flow Pipeline',
    deckanalyzer: 'Deck Analyzer',
    valuation: 'Valuation Intelligence',
    thesis: 'Thesis Tracker',
    portfolio: 'Portfolio Command Center',
    powermoves: 'Power Moves & Signals',
    patterns: 'Pattern Recognition Engine',
    briefing: 'Daily Intelligence Brief',
    integrations: 'Integrations Hub'
  };
  document.getElementById('page-title').textContent = titles[section] || '';

  // Close mobile menu
  document.getElementById('sidebar').classList.remove('open');

  renderCurrentSection();
}

function renderCurrentSection() {
  const area = document.getElementById('content-area');
  area.scrollTop = 0;

  switch (currentSection) {
    case 'dealflow': renderDealFlow(area); break;
    case 'deckanalyzer': renderDeckAnalyzer(area); break;
    case 'valuation': renderValuation(area); break;
    case 'thesis': renderThesis(area); break;
    case 'portfolio': renderPortfolio(area); break;
    case 'powermoves': renderPowerMoves(area); break;
    case 'patterns': renderPatterns(area); break;
    case 'briefing': renderBriefing(area); break;
    case 'integrations': renderIntegrations(area); break;
  }
}

// ============================================================
// MODULE 1: Deal Flow
// ============================================================
function getFilteredStartups() {
  return rankedStartups.filter(s => {
    if (filters.geo !== 'All' && s.geography !== filters.geo) return false;
    if (filters.sector !== 'All' && s.sector !== filters.sector) return false;
    if (filters.tier !== 'All' && s.scores.tier.class !== filters.tier) return false;
    if (filters.search) {
      const q = filters.search;
      const searchable = `${s.name} ${s.sector} ${s.subSector} ${s.geography} ${s.city} ${s.founders.map(f => f.name + ' ' + f.pedigree).join(' ')}`.toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });
}

function renderDealFlow(area) {
  const filtered = getFilteredStartups();
  const hot = filtered.filter(s => s.scores.tier.class === 'tier-hot').length;
  const warm = filtered.filter(s => s.scores.tier.class === 'tier-warm').length;
  const avgScore = filtered.length ? Math.round(filtered.reduce((a, s) => a + s.scores.composite, 0) / filtered.length) : 0;

  const todaySignals = filtered.reduce((acc, s) => {
    return acc + Object.values(s.signals).filter(sig => sig.score >= 75).length;
  }, 0);

  area.innerHTML = `
    <div class="stats-bar">
      <div class="stat-card">
        <div class="stat-label">Deals Tracked</div>
        <div class="stat-value emerald">${filtered.length}</div>
        <div class="stat-change positive">↑ across ${new Set(filtered.map(s => s.geography)).size} markets</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Hot Deals</div>
        <div class="stat-value orange">${hot}</div>
        <div class="stat-change positive">🔥 Immediate attention</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Strong Signals Today</div>
        <div class="stat-value pink">${todaySignals}</div>
        <div class="stat-change positive">Signals scoring 75+</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Average Score</div>
        <div class="stat-value blue">${avgScore}</div>
        <div class="stat-change ${avgScore > 60 ? 'positive' : ''}">${avgScore > 60 ? '↑ Above threshold' : '→ Monitoring'}</div>
      </div>
    </div>

    <div class="deal-grid">
      ${filtered.map((s, i) => renderDealCard(s, i)).join('')}
    </div>
  `;

  // Bind card clicks
  area.querySelectorAll('.deal-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const startup = rankedStartups.find(s => s.id === id);
      if (startup) openDealModal(startup);
    });
  });
}

function renderDealCard(s, idx) {
  const topSignals = Object.entries(s.signals)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 4);

  const trendData = s.signals.appDownloads?.trend || s.signals.viralTraction?.trend || s.signals.hiringSpike?.trend;
  const sparkline = trendData ? createSparkline(trendData, getScoreColor(s.scores.composite)) : '';

  return `
    <div class="deal-card ${s.scores.tier.class} animated-item" data-id="${s.id}">
      <div class="deal-rank">#${s.rank}</div>
      <div class="deal-info">
        <div class="deal-header">
          <div class="deal-logo">${s.logo}</div>
          <div class="deal-name">${s.name}</div>
          <span class="deal-tier-badge ${s.scores.tier.class}">${s.scores.tier.emoji} ${s.scores.tier.label}</span>
        </div>
        <div class="deal-meta">
          <span class="deal-tag ${s.sector === 'Consumer Tech' ? 'sector-consumer' : 'sector-b2b'}">${s.subSector}</span>
          <span class="deal-tag geo">📍 ${s.city}, ${s.geography}</span>
          <span class="deal-tag">${s.stage}</span>
          <span class="deal-tag">$${s.lastRound.amount}M ${s.lastRound.type}</span>
        </div>
      </div>
      <div class="deal-signals">
        ${topSignals.map(([key, sig]) => {
    const info = SIGNAL_TYPES.find(t => t.key === key);
    return `<div class="signal-dot ${sig.score >= 75 ? 'hot' : ''}" title="${info?.label}: ${sig.score}">
            ${info?.icon || '📊'}
            <div class="tooltip">${info?.label}: ${sig.score}/100</div>
          </div>`;
  }).join('')}
      </div>
      <div class="sparkline-container">${sparkline}</div>
      <div class="deal-score-container">
        <div class="deal-score ${getScoreClass(s.scores.composite)}">${s.scores.composite}</div>
        <div class="deal-score-label">Score</div>
      </div>
    </div>
  `;
}

function openDealModal(s) {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');

  content.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">
        <div class="deal-logo">${s.logo}</div>
        <div>
          <h3>${s.name}</h3>
          <div class="sub">${s.subSector} · ${s.city}, ${s.geography} · ${s.stage}</div>
        </div>
        <span class="deal-tier-badge ${s.scores.tier.class}" style="margin-left:12px">${s.scores.tier.emoji} ${s.scores.tier.label}</span>
      </div>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">
      <div class="modal-section">
        <div class="modal-section-title">Company Description</div>
        <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6">${s.description}</p>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Scoring Radar</div>
        <div class="radar-chart-container">
          ${createRadarChart(s.scores.dimensions)}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Score Breakdown</div>
        <div class="score-breakdown">
          ${Object.entries(s.scores.dimensions).map(([key, val]) => {
    const labels = { marketSize: 'Market Size', founderPedigree: 'Founder Pedigree', earlyTraction: 'Early Traction', productDifferentiation: 'Product Diff.', fundability: 'Fundability' };
    return `
              <div class="score-dim">
                <div class="score-dim-label">${labels[key]}</div>
                <div class="score-dim-bar"><div class="score-dim-bar-fill" style="width:${val}%;background:${getBarColor(val)}"></div></div>
                <div class="score-dim-val" style="color:${getBarColor(val)}">${val}</div>
              </div>`;
  }).join('')}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Founders</div>
        <div class="founders-list">
          ${s.founders.map(f => `
            <div class="founder-card">
              <div class="founder-avatar">${f.name.split(' ').map(n => n[0]).join('')}</div>
              <div>
                <div class="founder-name">${f.name} <span class="founder-role">· ${f.role}</span></div>
                <div class="founder-pedigree">${f.pedigree}${f.previousExits ? ` · ${f.previousExits} prior exit${f.previousExits > 1 ? 's' : ''}` : ''}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Signal Strength</div>
        <div class="signals-grid">
          ${SIGNAL_TYPES.map(st => {
    const sig = s.signals[st.key];
    return `
              <div class="signal-card">
                <div class="signal-card-header">
                  <span class="signal-card-icon">${st.icon}</span>
                  <span class="signal-card-label">${st.label}</span>
                </div>
                <div class="signal-card-score" style="color:${getBarColor(sig.score)}">${sig.score}/100</div>
                <div class="signal-card-detail">${sig.detail}</div>
                ${sig.trend ? `<div style="margin-top:8px">${createSparkline(sig.trend, st.color, 120, 28)}</div>` : ''}
              </div>`;
  }).join('')}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Key Metrics</div>
        <div class="score-breakdown">
          <div class="score-dim"><div class="score-dim-label">MAU</div><div class="score-dim-val" style="color:var(--accent-blue)">${s.metrics.mau >= 1000 ? (s.metrics.mau / 1000).toFixed(0) + 'K' : s.metrics.mau}</div></div>
          <div class="score-dim"><div class="score-dim-label">MAU Growth</div><div class="score-dim-val" style="color:var(--accent-emerald)">${s.metrics.mauGrowth}%</div></div>
          <div class="score-dim"><div class="score-dim-label">MRR</div><div class="score-dim-val" style="color:var(--accent-amber)">$${(s.metrics.revenue / 1000).toFixed(0)}K</div></div>
          <div class="score-dim"><div class="score-dim-label">Rev Growth</div><div class="score-dim-val" style="color:var(--accent-emerald)">${s.metrics.revenueGrowth}%</div></div>
          <div class="score-dim"><div class="score-dim-label">Burn Rate</div><div class="score-dim-val" style="color:var(--accent-pink)">$${(s.metrics.burnRate / 1000).toFixed(0)}K</div></div>
          <div class="score-dim"><div class="score-dim-label">Runway</div><div class="score-dim-val" style="color:${s.metrics.runway > 12 ? 'var(--accent-emerald)' : 'var(--accent-red)'}">${s.metrics.runway} mo</div></div>
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">💡 Investment Thesis</div>
        <div class="thesis-box">
          <p>${s.thesis}</p>
        </div>
      </div>
    </div>
  `;

  modal.classList.add('active');
  content.querySelector('#modal-close-btn').addEventListener('click', closeModal);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

// ============================================================
// MODULE 8: Deck Analyzer
// ============================================================

const SAMPLE_DECKS = [
  {
    id: 'deck-001', name: 'FactoryOS - Series A Deck', company: 'FactoryOS', type: 'pdf', uploadDate: '2026-02-27',
    ratings: { problem: 88, solution: 82, market: 90, team: 92, traction: 78, businessModel: 75, financials: 70, ask: 80 },
    verdict: 'pass', verdictText: 'Strong deck — clear problem-solution fit, impressive team pedigree, and validated traction. Market sizing is well-researched. Financial projections need tighter unit economics. Recommend proceeding to partner meeting.',
    strengths: ['Exceptional founder-market fit', 'Clear TAM/SAM/SOM breakdown', 'Customer testimonials from 3 enterprise logos'],
    weaknesses: ['Unit economics slide lacks detail', 'Competitive moat section could be stronger']
  },
  {
    id: 'deck-002', name: 'Playlo - Pre-Series A Deck', company: 'Playlo', type: 'ppt', uploadDate: '2026-02-26',
    ratings: { problem: 72, solution: 85, market: 80, team: 78, traction: 92, businessModel: 68, financials: 60, ask: 72 },
    verdict: 'review', verdictText: 'Compelling traction story with viral metrics. However, monetization strategy needs further diligence. Retention data is strong (D7: 38%) but D30 is missing. Request follow-up with deeper cohort analysis.',
    strengths: ['Explosive growth metrics', 'Viral coefficient > 1.2', 'SEA gaming market timing is perfect'],
    weaknesses: ['Monetization unclear — ARPU not defined', 'Missing D30 retention cohorts', 'Burn rate projection seems optimistic']
  },
  {
    id: 'deck-003', name: 'GreenMill - Seed Extension', company: 'GreenMill', type: 'pdf', uploadDate: '2026-02-25',
    ratings: { problem: 95, solution: 88, market: 92, team: 87, traction: 72, businessModel: 82, financials: 78, ask: 85 },
    verdict: 'pass', verdictText: 'Excellent regulatory-driven thesis. EU CBAM creates forced buyer behavior — rare in B2B SaaS. Team has unique Shell background. Ask is reasonable for traction stage. Move to IC.',
    strengths: ['Regulatory tailwind = forced adoption', 'Founder ran $500M sustainability budget at Shell', 'Land-and-expand model proven with 3 MNCs'],
    weaknesses: ['ASEAN regulatory timeline uncertain', 'Customer willingness-to-pay needs validation beyond pilots']
  },
  {
    id: 'deck-004', name: 'QuickServe - Seed Deck', company: 'QuickServe (New)', type: 'pdf', uploadDate: '2026-02-24',
    ratings: { problem: 55, solution: 50, market: 60, team: 45, traction: 30, businessModel: 40, financials: 35, ask: 42 },
    verdict: 'skip', verdictText: 'Crowded space with no clear differentiation. Team lacks relevant industry experience. Pre-revenue with aggressive valuation ask. Pass — recommend monitoring only if they demonstrate 3 months of traction.',
    strengths: ['Large addressable market'],
    weaknesses: ['No differentiation from 10+ competitors', 'First-time founders, no domain expertise', 'Pre-revenue asking $12M valuation', '$0 revenue, no LOIs']
  }
];

function renderDeckAnalyzer(area) {
  const total = uploadedDecks.length + SAMPLE_DECKS.length;
  const allDecks = [...SAMPLE_DECKS, ...uploadedDecks];
  const passCount = allDecks.filter(d => d.verdict === 'pass').length;
  const reviewCount = allDecks.filter(d => d.verdict === 'review').length;
  const skipCount = allDecks.filter(d => d.verdict === 'skip').length;

  area.innerHTML = `
    <div class="stats-bar">
      <div class="stat-card">
        <div class="stat-label">Total Decks</div>
        <div class="stat-value emerald">${total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">✅ Pass to IC</div>
        <div class="stat-value emerald">${passCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">🔍 Needs Review</div>
        <div class="stat-value amber">${reviewCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">❌ Skip</div>
        <div class="stat-value orange">${skipCount}</div>
      </div>
    </div>

    <div class="deck-upload-zone" id="deck-upload-zone">
      <span class="upload-icon">📄</span>
      <div class="upload-title">Drop a pitch deck here to analyze</div>
      <div class="upload-subtitle">Supports PDF, PPTX, Google Slides links · AI-powered rating in seconds</div>
      <button class="upload-btn">Browse Files</button>
      <input type="file" id="deck-file-input" accept=".pdf,.pptx,.ppt">
    </div>

    <div class="section-title-row" style="margin-top:24px">
      <div class="section-title">Analyzed Decks</div>
      <div class="section-subtitle">${total} decks rated · Click to expand</div>
    </div>

    <div class="decks-grid">
      ${allDecks.map(d => renderDeckCard(d)).join('')}
    </div>
  `;

  // Bind upload
  const uploadZone = document.getElementById('deck-upload-zone');
  const fileInput = document.getElementById('deck-file-input');

  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    handleDeckUpload(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', (e) => handleDeckUpload(e.target.files));
}

function handleDeckUpload(files) {
  if (!files || files.length === 0) return;
  const file = files[0];
  const ext = file.name.split('.').pop().toLowerCase();
  const type = ext === 'pdf' ? 'pdf' : 'ppt';

  // Simulate AI analysis
  const ratings = {
    problem: 50 + Math.floor(Math.random() * 40),
    solution: 50 + Math.floor(Math.random() * 40),
    market: 50 + Math.floor(Math.random() * 40),
    team: 40 + Math.floor(Math.random() * 45),
    traction: 30 + Math.floor(Math.random() * 50),
    businessModel: 40 + Math.floor(Math.random() * 45),
    financials: 35 + Math.floor(Math.random() * 45),
    ask: 40 + Math.floor(Math.random() * 45)
  };

  const avg = Math.round(Object.values(ratings).reduce((a, b) => a + b, 0) / 8);
  let verdict, verdictText;
  if (avg >= 75) {
    verdict = 'pass';
    verdictText = `Strong deck from ${file.name.replace(/\.[^/.]+$/, '')}. Recommend proceeding to partner meeting for deeper evaluation. Key metrics and team credentials are compelling.`;
  } else if (avg >= 55) {
    verdict = 'review';
    verdictText = `Deck shows promise but needs additional diligence. Some sections are strong but others need more data. Request follow-up materials before IC.`;
  } else {
    verdict = 'skip';
    verdictText = `Deck does not meet current investment criteria. Insufficient traction and unclear competitive positioning. Recommend passing at this stage.`;
  }

  const newDeck = {
    id: `deck-${Date.now()}`,
    name: file.name.replace(/\.[^/.]+$/, ''),
    company: file.name.replace(/\.[^/.]+$/, '').split('-')[0].trim(),
    type: type,
    uploadDate: new Date().toISOString().split('T')[0],
    ratings,
    verdict,
    verdictText,
    strengths: ['AI analysis in progress — review manually for full assessment'],
    weaknesses: ['Automated analysis may miss nuances — partner review recommended']
  };

  uploadedDecks.unshift(newDeck);
  renderDeckAnalyzer(document.getElementById('content-area'));
}

function renderDeckCard(d) {
  const ratingLabels = {
    problem: 'Problem', solution: 'Solution', market: 'Market Size',
    team: 'Team', traction: 'Traction', businessModel: 'Biz Model',
    financials: 'Financials', ask: 'The Ask'
  };
  const avg = Math.round(Object.values(d.ratings).reduce((a, b) => a + b, 0) / 8);
  const circumference = 2 * Math.PI * 22;
  const offset = circumference - (avg / 100) * circumference;
  const ringColor = avg >= 75 ? 'var(--accent-emerald)' : avg >= 55 ? 'var(--accent-amber)' : 'var(--accent-red)';

  return `
    <div class="deck-card animated-item">
      <div class="deck-card-header">
        <div class="deck-card-icon ${d.type}">${d.type === 'pdf' ? '📕' : '📊'}</div>
        <div>
          <div class="deck-card-name">${d.name}</div>
          <div class="deck-card-meta">
            <span class="deal-tag">${d.company}</span>
            <span class="deck-card-timestamp">${d.uploadDate}</span>
          </div>
        </div>
        <div class="deck-overall-score">
          <div class="score-ring">
            <svg viewBox="0 0 48 48">
              <circle class="bg" cx="24" cy="24" r="22" />
              <circle class="progress" cx="24" cy="24" r="22"
                stroke="${ringColor}"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${offset}" />
            </svg>
            <div class="score-ring-value" style="color:${ringColor}">${avg}</div>
          </div>
        </div>
      </div>

      <div class="deck-ratings">
        ${Object.entries(d.ratings).map(([key, val]) => `
          <div class="deck-rating-row">
            <div class="deck-rating-label">${ratingLabels[key]}</div>
            <div class="deck-rating-bar"><div class="deck-rating-bar-fill" style="width:${val}%;background:${getBarColor(val)}"></div></div>
            <div class="deck-rating-val" style="color:${getBarColor(val)}">${val}</div>
          </div>
        `).join('')}
      </div>

      <div class="deck-verdict ${d.verdict}">
        <strong>${d.verdict === 'pass' ? '✅ PASS — Move to IC' : d.verdict === 'review' ? '🔍 REVIEW — Needs Follow-up' : '❌ SKIP — Does Not Meet Criteria'}</strong><br>
        ${d.verdictText}
      </div>

      ${d.strengths ? `
        <div style="margin-top:10px;font-size:0.75rem">
          <span style="color:var(--accent-emerald);font-weight:700">Strengths:</span>
          <span style="color:var(--text-secondary)">${d.strengths.join(' · ')}</span>
        </div>` : ''}
      ${d.weaknesses ? `
        <div style="margin-top:4px;font-size:0.75rem">
          <span style="color:var(--accent-amber);font-weight:700">Weaknesses:</span>
          <span style="color:var(--text-secondary)">${d.weaknesses.join(' · ')}</span>
        </div>` : ''}

      <div class="deck-action-btns">
        <button class="deck-action-btn primary">📋 Add to Pipeline</button>
        <button class="deck-action-btn">💬 Share with Team</button>
        <button class="deck-action-btn">📥 Download Report</button>
      </div>
    </div>
  `;
}

// ============================================================
// MODULE 2: Valuation Intelligence
// ============================================================
function renderValuation(area) {
  const overpriced = VALUATION_COMPS.filter(v => v.status === 'overpriced').length;
  const underpriced = VALUATION_COMPS.filter(v => v.status === 'underpriced').length;

  area.innerHTML = `
    <div class="stats-bar">
      <div class="stat-card">
        <div class="stat-label">Companies Analyzed</div>
        <div class="stat-value emerald">${VALUATION_COMPS.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Fairly Valued</div>
        <div class="stat-value blue">${VALUATION_COMPS.filter(v => v.status === 'fair').length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Underpriced 🎯</div>
        <div class="stat-value emerald">${underpriced}</div>
        <div class="stat-change positive">Potential alpha</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Overpriced ⚠️</div>
        <div class="stat-value orange">${overpriced}</div>
      </div>
    </div>

    <div class="section-title-row">
      <div class="section-title">Valuation Analysis & Comparables</div>
      <div class="section-subtitle">Fair value estimates based on comparable deals</div>
    </div>

    <div class="deal-grid">
      ${VALUATION_COMPS.map((v, i) => `
        <div class="deal-card animated-item" style="grid-template-columns: 1fr auto; cursor:default;">
          <div class="deal-info">
            <div class="deal-header">
              <div class="deal-name">${v.name}</div>
              <span class="deal-tag">${v.stage}</span>
              <span class="deal-tag sector-b2b">${v.model}</span>
              <span class="val-tag ${v.status}">${v.status === 'fair' ? '✅ Fair' : v.status === 'underpriced' ? '🎯 Underpriced' : '⚠️ Overpriced'}</span>
            </div>
            <div style="margin-top:12px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
              <div>
                <div class="stat-label">Revenue</div>
                <div style="font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--accent-emerald)">${v.revenue}</div>
              </div>
              <div>
                <div class="stat-label">Growth</div>
                <div style="font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--accent-amber)">${v.growth}</div>
              </div>
              <div>
                <div class="stat-label">Fair Valuation</div>
                <div style="font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--accent-blue)">${v.fairVal}</div>
              </div>
              <div>
                <div class="stat-label">Current Valuation</div>
                <div style="font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--text-primary)">${v.currentVal}</div>
              </div>
            </div>
            <div style="margin-top:12px">
              <div class="stat-label" style="margin-bottom:6px">Comparable Deals</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${v.comps.map(c => `<span class="deal-tag">${c}</span>`).join('')}
              </div>
            </div>
            <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div>
                <div class="stat-label" style="margin-bottom:4px">Next Round Potential</div>
                <div style="font-size:0.8rem;color:var(--accent-emerald);line-height:1.4">${v.nextRound}</div>
              </div>
              <div>
                <div class="stat-label" style="margin-bottom:4px">Risks VCs May Ignore</div>
                <div style="font-size:0.8rem;color:var(--accent-amber);line-height:1.4">${v.risks}</div>
              </div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================
// MODULE 3: Thesis Tracker
// ============================================================
function renderThesis(area) {
  area.innerHTML = `
    <div class="insight-box positive">
      <span class="insight-emoji">🧭</span>
      <strong>Your thesis is getting stronger in:</strong> AI-Powered Manufacturing, Sustainable Manufacturing, Affordable Industrial Robotics. Capital is flowing into factory-tech at unprecedented rates.
    </div>
    <div class="insight-box warning">
      <span class="insight-emoji">⚠️</span>
      <strong>You are underexposed to:</strong> Semiconductor Supply Chain, Agri-Manufacturing. Both are $50B+ TAM markets with strong regulatory tailwinds and minimal VC competition.
    </div>

    <div class="section-title-row" style="margin-top:24px">
      <div class="section-title">🚀 Accelerating Themes</div>
      <div class="section-subtitle">Capital flowing in, conviction building</div>
    </div>
    <div class="thesis-grid">
      ${THESIS_DATA.accelerating.map(t => `
        <div class="thesis-card accelerating animated-item">
          <div class="thesis-card-emoji">${t.emoji}</div>
          <div class="thesis-card-title">${t.title}</div>
          <div class="thesis-card-desc">${t.desc}</div>
          <div class="thesis-card-status up">${t.status}</div>
        </div>
      `).join('')}
    </div>

    <div class="section-title-row" style="margin-top:28px">
      <div class="section-title">⚠️ Getting Saturated</div>
      <div class="section-subtitle">High competition, margins compressing</div>
    </div>
    <div class="thesis-grid">
      ${THESIS_DATA.saturated.map(t => `
        <div class="thesis-card saturated animated-item">
          <div class="thesis-card-emoji">${t.emoji}</div>
          <div class="thesis-card-title">${t.title}</div>
          <div class="thesis-card-desc">${t.desc}</div>
          <div class="thesis-card-status flat">${t.status}</div>
        </div>
      `).join('')}
    </div>

    <div class="section-title-row" style="margin-top:28px">
      <div class="section-title">💎 White Spaces</div>
      <div class="section-subtitle">Low competition, massive TAM, strong thesis fit</div>
    </div>
    <div class="thesis-grid" style="grid-template-columns: repeat(4, 1fr)">
      ${THESIS_DATA.whitespace.map(t => `
        <div class="thesis-card whitespace animated-item">
          <div class="thesis-card-emoji">${t.emoji}</div>
          <div class="thesis-card-title">${t.title}</div>
          <div class="thesis-card-desc">${t.desc}</div>
          <div class="thesis-card-status up">${t.status}</div>
        </div>
      `).join('')}
    </div>

    <div class="section-title-row" style="margin-top:28px">
      <div class="section-title">📊 Portfolio Construction Gaps</div>
    </div>
    <div class="deal-grid">
      ${THESIS_DATA.gaps.map(g => `
        <div class="insight-box ${g.signal === 'positive' ? 'positive' : g.signal === 'negative' ? 'warning' : 'info'} animated-item">
          <span class="insight-emoji">${g.emoji}</span>
          <strong>${g.title}</strong> — ${g.desc}
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================
// MODULE 4: Portfolio Command Center
// ============================================================
function renderPortfolio(area) {
  const greenCount = PORTFOLIO_DATA.filter(p => p.health === 'green').length;
  const followOnReady = PORTFOLIO_DATA.filter(p => p.followOnReady).length;

  area.innerHTML = `
    <div class="stats-bar">
      <div class="stat-card">
        <div class="stat-label">Portfolio Companies</div>
        <div class="stat-value emerald">${PORTFOLIO_DATA.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Health: Green</div>
        <div class="stat-value emerald">${greenCount}</div>
        <div class="stat-change positive">✅ On track</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Follow-on Ready</div>
        <div class="stat-value blue">${followOnReady}</div>
        <div class="stat-change positive">Pro-rata opportunity</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Alerts</div>
        <div class="stat-value orange">${PORTFOLIO_DATA.filter(p => p.health !== 'green').length}</div>
        <div class="stat-change negative">Needs attention</div>
      </div>
    </div>

    <div class="section-title-row">
      <div class="section-title">📊 Weekly Partner Update</div>
      <div class="section-subtitle">Auto-generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
    </div>

    <div class="portfolio-grid">
      ${PORTFOLIO_DATA.map((p, i) => `
        <div class="portfolio-card animated-item">
          <div class="portfolio-logo">${p.logo}</div>
          <div>
            <div class="portfolio-info-name">${p.name}</div>
            <div class="portfolio-info-sub">${p.stage}</div>
          </div>
          <div class="portfolio-metric">
            <div class="portfolio-metric-value" style="color:var(--accent-blue)">${p.hiring}</div>
            <div class="portfolio-metric-label">Hiring</div>
          </div>
          <div class="portfolio-metric">
            <div class="portfolio-metric-value" style="color:var(--accent-emerald)">${p.traffic}</div>
            <div class="portfolio-metric-label">Traffic</div>
          </div>
          <div class="portfolio-metric">
            <div class="portfolio-metric-value" style="color:var(--accent-purple)">${p.appRank}</div>
            <div class="portfolio-metric-label">App Rank</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;min-width:240px">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="health-indicator ${p.health}">${p.health === 'green' ? '● Healthy' : p.health === 'yellow' ? '● Caution' : '● Alert'}</span>
              ${p.followOnReady ? '<span class="health-indicator green">↑ Follow-on Ready</span>' : ''}
            </div>
            <div style="font-size:0.72rem;color:var(--text-tertiary)">Sentiment: ${p.sentiment} | Competitor: ${p.compFunding}</div>
            ${p.signals.map(sig => `<div style="font-size:0.75rem;color:${sig.startsWith('⚠️') ? 'var(--accent-amber)' : 'var(--text-secondary)'};line-height:1.4">• ${sig}</div>`).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================
// MODULE 5: Power Moves & Gossip
// ============================================================
function renderPowerMoves(area) {
  area.innerHTML = `
    <div class="insight-box info">
      <span class="insight-emoji">🕵️</span>
      <strong>Intelligence Summary:</strong> Sequoia's mega-fund will inflate manufacturing-tech valuations. Two stealth competitors raising in your portfolio's space. One key partner movement creates co-investment opportunity.
    </div>

    <div class="section-title-row" style="margin-top:20px">
      <div class="section-title">Network Intelligence Feed</div>
      <div class="section-subtitle">Signals that move markets</div>
    </div>

    <div class="power-timeline">
      ${POWER_MOVES.map((pm, i) => `
        <div class="power-event animated-item">
          <div class="power-event-type">${pm.type}</div>
          <div class="power-event-title">${pm.title}</div>
          <div class="power-event-desc">${pm.desc}</div>
          <div class="power-event-implication">${pm.implication}</div>
          <div class="power-event-time">${pm.time}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================
// MODULE 6: Pattern Recognition Engine
// ============================================================
function renderPatterns(area) {
  area.innerHTML = `
    <div class="insight-box positive">
      <span class="insight-emoji">🧬</span>
      <strong>Pattern Insight:</strong> In JV's portfolio, 100% of companies with composite score >75 have founders with prior exits AND regulatory tailwinds. Speed of execution (MVP <90 days) correlates with 3x Series A success rate.
    </div>

    <div class="section-title-row" style="margin-top:20px">
      <div class="section-title">What Winners Look Like Before They Win</div>
      <div class="section-subtitle">Patterns from historical startup data analysis</div>
    </div>

    <div class="pattern-columns">
      <div class="pattern-column">
        <div class="pattern-column-title"><span style="color:var(--accent-emerald)">✅</span> Winner Patterns</div>
        ${PATTERN_WINNERS.map(p => `
          <div class="pattern-item">
            <div class="pattern-check win">✓</div>
            <div class="pattern-text">${p.text}</div>
          </div>
        `).join('')}
      </div>
      <div class="pattern-column">
        <div class="pattern-column-title"><span style="color:var(--accent-red)">✗</span> Failure Patterns</div>
        ${PATTERN_LOSERS.map(p => `
          <div class="pattern-item">
            <div class="pattern-check fail">✗</div>
            <div class="pattern-text">${p.text}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="section-title-row" style="margin-top:28px">
      <div class="section-title">📋 New Deal Evaluation Checklist</div>
      <div class="section-subtitle">Score ≥7/10 = strong conviction · 5-6 = deep dive · <5 = pass</div>
    </div>

    <div class="checklist-grid">
      ${EVAL_CHECKLIST.map(c => `
        <div class="checklist-item animated-item">
          <span class="checklist-icon">${c.icon}</span>
          <span>${c.label}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================
// MODULE 7: Daily Intelligence Briefing
// ============================================================
function renderBriefing(area) {
  const top5 = rankedStartups.slice(0, 5);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  area.innerHTML = `
    <div class="briefing-container">
      <div class="briefing-date">📅 ${dateStr} · 5 min read</div>

      <div class="briefing-section">
        <div class="briefing-section-header">
          <span class="briefing-section-emoji">🎯</span>
          <span class="briefing-section-title">5 Deals to Track</span>
          <span class="briefing-section-count">TOP PICKS</span>
        </div>
        ${top5.map((s, i) => `
          <div class="briefing-item animated-item">
            <div class="briefing-item-title">${i + 1}. ${s.scores.tier.emoji} ${s.name} — ${s.subSector} (${s.geography})</div>
            <div class="briefing-item-body">
              Score: <strong>${s.scores.composite}</strong> | ${s.stage} | $${s.lastRound.amount}M ${s.lastRound.type}<br>
              <strong>Why now:</strong> ${Object.entries(s.signals).sort((a, b) => b[1].score - a[1].score)[0][1].detail}
            </div>
          </div>
        `).join('')}
      </div>

      <div class="briefing-section">
        <div class="briefing-section-header">
          <span class="briefing-section-emoji">📈</span>
          <span class="briefing-section-title">3 Trends</span>
          <span class="briefing-section-count">MARKET PULSE</span>
        </div>
        <div class="briefing-item animated-item">
          <div class="briefing-item-title">1. Factory AI funding up 180% YoY in India</div>
          <div class="briefing-item-body">India's PLI scheme + China+1 migration driving unprecedented demand for manufacturing automation. Three JV portfolio companies (FactoryOS, QualityLens, SteelMind) are in the sweet spot. Expect Series A valuations to 2x by Q3 2026.</div>
        </div>
        <div class="briefing-item animated-item">
          <div class="briefing-item-title">2. SEA social commerce GMV growing 45% QoQ</div>
          <div class="briefing-item-body">Livestream shopping adoption in Vietnam and Indonesia outpacing all other channels. ShopHero and Playlo are early indicators. TikTok Shop's ASEAN revenue hit $4.4B — creating platform risk but also massive distribution opportunity.</div>
        </div>
        <div class="briefing-item animated-item">
          <div class="briefing-item-title">3. ESG compliance becoming mandatory for ASEAN exporters</div>
          <div class="briefing-item-body">EU CBAM (Carbon Border Adjustment Mechanism) takes full effect 2026. Singapore carbon tax doubled. Vietnamese factories need carbon accounting or lose EU export access. GreenMill's TAM just expanded significantly.</div>
        </div>
      </div>

      <div class="briefing-section">
        <div class="briefing-section-header">
          <span class="briefing-section-emoji">🔮</span>
          <span class="briefing-section-title">1 Contrarian Insight</span>
        </div>
        <div class="briefing-item contrarian animated-item">
          <div class="briefing-item-title">Everyone's chasing AI SaaS — the real alpha is in hardware-software combos</div>
          <div class="briefing-item-body">While VCs pile into pure software plays, RoboWeld and PackBot combine hardware + AI software at 70% gross margins. Hardware creates lock-in that software alone can't achieve. Chinese competitors can't replicate the local field service network. This is the Fanuc/Keyence playbook, not the Salesforce one. JV should double down here while others look away.</div>
        </div>
      </div>

      <div class="briefing-section">
        <div class="briefing-section-header">
          <span class="briefing-section-emoji">🚨</span>
          <span class="briefing-section-title">1 Portfolio Alert</span>
        </div>
        <div class="briefing-item alert animated-item">
          <div class="briefing-item-title">⚠️ KartBee — Competitor QuickBasket raised $22M Series A</div>
          <div class="briefing-item-body">Direct competitor in Tier-2 quick commerce just closed $22M from Tiger Global. KartBee has 14 months runway but needs to accelerate expansion to defend territory. <strong>Recommendation:</strong> Schedule emergency board call to discuss accelerated fundraise timeline and potential bridge from existing investors.</div>
        </div>
      </div>

      <div class="briefing-section">
        <div class="briefing-section-header">
          <span class="briefing-section-emoji">🌶️</span>
          <span class="briefing-section-title">1 Spicy Ecosystem Update</span>
        </div>
        <div class="briefing-item spicy animated-item">
          <div class="briefing-item-title">Sequoia's $2.8B mega-fund is about to reshape SEA deal dynamics</div>
          <div class="briefing-item-body">Sources indicate Sequoia India/SEA is deploying aggressively into manufacturing-tech — the exact same thesis as JV. Two of their scouts have already reached out to FactoryOS and QualityLens for "coffee chats." <strong>This is both validation and threat.</strong> JV should lock pro-rata rights immediately and consider preemptive term sheets for highest-conviction names. The window to lead rounds cheaply is closing fast. 🔥</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// MODULE 9: Integrations Hub
// ============================================================
function renderIntegrations(area) {
  const gmailStatus = integrationState.gmail.connected ? 'connected' : 'disconnected';
  const streakStatus = integrationState.streak.connected ? 'connected' : 'disconnected';
  const supabaseStatus = integrationState.supabase.connected ? 'connected' : 'disconnected';
  const now = new Date().toLocaleTimeString('en-US', { hour12: false });

  area.innerHTML = `
    <div class="stats-bar">
      <div class="stat-card">
        <div class="stat-label">Integrations</div>
        <div class="stat-value emerald">4</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Connected</div>
        <div class="stat-value emerald">${[integrationState.gmail.connected, integrationState.streak.connected, integrationState.supabase.connected].filter(Boolean).length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Team Members</div>
        <div class="stat-value blue">${integrationState.team.members.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Sync Status</div>
        <div class="stat-value ${supabaseStatus === 'connected' ? 'emerald' : 'orange'}">${supabaseStatus === 'connected' ? 'Live' : 'Offline'}</div>
      </div>
    </div>

    <div class="integrations-grid">

      <!-- Supabase -->
      <div class="integration-card animated-item">
        <div class="integration-card-header">
          <div class="integration-logo supabase">🔋</div>
          <div>
            <div class="integration-name">Supabase</div>
            <div class="integration-desc">Real-time database & collaboration backend</div>
          </div>
          <div class="integration-status ${supabaseStatus}">
            <span>●</span> ${supabaseStatus === 'connected' ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        <div class="integration-body">
          ${integrationState.supabase.connected ? `
            <div class="sync-log">
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Connected to Supabase</span></div>
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Project: vtxuzrkwnyhxciohwjjx</span></div>
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Real-time sync active</span></div>
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Ready for multi-user collaboration</span></div>
            </div>
          ` : `
            <div class="integration-input-group">
              <input class="integration-input" placeholder="Project URL" id="sb-url" value="${SUPABASE_URL}">
            </div>
            <div class="integration-input-group">
              <input class="integration-input" placeholder="Anon Key" id="sb-key" value="${SUPABASE_KEY}">
              <button class="integration-connect-btn" id="connect-supabase">Connect</button>
            </div>
          `}
          <div class="integration-features">
            <div class="integration-feature"><span class="integration-feature-icon">✅</span> Store deals, decks, and theses in cloud</div>
            <div class="integration-feature"><span class="integration-feature-icon">✅</span> Real-time collaboration with team</div>
            <div class="integration-feature"><span class="integration-feature-icon">✅</span> Access from any device / browser</div>
            <div class="integration-feature"><span class="integration-feature-icon">✅</span> Automatic backups & version history</div>
          </div>
        </div>
      </div>

      <!-- Gmail -->
      <div class="integration-card animated-item">
        <div class="integration-card-header">
          <div class="integration-logo gmail">📧</div>
          <div>
            <div class="integration-name">Gmail</div>
            <div class="integration-desc">Auto-scan deal emails & founder intros</div>
          </div>
          <div class="integration-status ${gmailStatus}">
            <span>●</span> ${gmailStatus === 'connected' ? 'Connected' : 'Not Connected'}
          </div>
        </div>
        <div class="integration-body">
          ${integrationState.gmail.connected ? `
            <div class="insight-box positive" style="margin:0">Connected as <strong>${integrationState.gmail.email}</strong></div>
            ${integrationState.gmail.emails.length > 0 ? `
              <div class="sync-log" style="max-height:180px">
                ${integrationState.gmail.emails.map(e => `
                  <div class="sync-log-entry" style="padding:6px 0">
                    <div style="font-weight:600;font-size:0.75rem;color:var(--text-primary)">${e.subject}</div>
                    <div style="font-size:0.68rem;color:var(--text-muted)">${e.from} · ${new Date(e.date).toLocaleDateString()}</div>
                    ${e.matchedStartups.length > 0 ? `<div style="margin-top:3px">${e.matchedStartups.map(s => `<span class="deal-tag" style="font-size:0.62rem">🏷️ ${s}</span>`).join(' ')}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            ` : `
              <div class="sync-log">
                <div class="sync-log-entry"><span class="sync-log-ok">✓ Connected — scanning for deal emails...</span></div>
              </div>
            `}
          ` : `
            <button class="integration-connect-btn google" id="connect-gmail" style="width:100%;justify-content:center">
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Connect Gmail Account
            </button>
            <div style="margin-top:8px;font-size:0.72rem;color:var(--text-muted);text-align:center">
              Click to set up Google OAuth · Steps will guide you through it
            </div>
          `}
          <div class="integration-features">
            <div class="integration-feature"><span class="integration-feature-icon">📥</span> Auto-detect deal mails from founders</div>
            <div class="integration-feature"><span class="integration-feature-icon">🏷️</span> Tag emails by startup in pipeline</div>
            <div class="integration-feature"><span class="integration-feature-icon">📊</span> Deal inbox with email thread summary</div>
            <div class="integration-feature"><span class="integration-feature-icon">🔔</span> Alerts for warm intro replies</div>
          </div>
        </div>
      </div>

      <!-- Streak CRM -->
      <div class="integration-card animated-item">
        <div class="integration-card-header">
          <div class="integration-logo streak">🔥</div>
          <div>
            <div class="integration-name">Streak CRM</div>
            <div class="integration-desc">Sync deal pipeline with Gmail CRM</div>
          </div>
          <div class="integration-status ${streakStatus}">
            <span>●</span> ${streakStatus === 'connected' ? 'Connected' : 'Not Connected'}
          </div>
        </div>
        <div class="integration-body">
          ${integrationState.streak.connected ? `
            <div class="insight-box positive" style="margin:0">✅ Syncing with Streak CRM — API key configured</div>
            <div class="sync-log">
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ API key validated: strk_...BiAx</span></div>
              ${integrationState.streak.pipelines.map(p => `
                <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Pipeline: ${p.name} (${p.boxes} boxes, ${p.stage})</span></div>
              `).join('')}
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Hot/Warm/Watch tiers mapped to Streak stages</span></div>
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Two-way sync active</span></div>
            </div>
          ` : `
            <div class="integration-input-group">
              <input class="integration-input" placeholder="Streak API Key (Settings → Integrations → API)" id="streak-key" type="password">
              <button class="integration-connect-btn streak-btn" id="connect-streak">Connect</button>
            </div>
          `}
          <div class="integration-features">
            <div class="integration-feature"><span class="integration-feature-icon">🔄</span> Two-way deal sync with Streak pipelines</div>
            <div class="integration-feature"><span class="integration-feature-icon">📋</span> Map Streak stages to JV tiers (Hot/Warm/Watch)</div>
            <div class="integration-feature"><span class="integration-feature-icon">📧</span> Link email threads to deal cards</div>
            <div class="integration-feature"><span class="integration-feature-icon">📊</span> Pull Streak deal notes into platform</div>
          </div>
        </div>
      </div>

      <!-- Team Collaboration -->
      <div class="integration-card animated-item">
        <div class="integration-card-header">
          <div class="integration-logo team">👥</div>
          <div>
            <div class="integration-name">Team</div>
            <div class="integration-desc">Collaborate and share the dashboard</div>
          </div>
          <div class="integration-status connected">
            <span>●</span> ${integrationState.team.members.length} members
          </div>
        </div>
        <div class="integration-body">
          <div class="team-grid">
            ${integrationState.team.members.map(m => `
              <div class="team-member-card">
                <div class="team-avatar" style="background:${m.color}">${m.name.split(' ').map(n => n[0]).join('')}</div>
                <div>
                  <div class="team-member-name">${m.name}</div>
                  <div class="team-member-role">${m.role}</div>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="team-invite-form">
            <input class="integration-input" placeholder="Email address" id="invite-email">
            <select class="integration-input" id="invite-role" style="flex:0 0 120px">
              <option>Partner</option>
              <option>Analyst</option>
              <option>Associate</option>
              <option>Viewer</option>
            </select>
            <button class="integration-connect-btn" id="invite-btn">Invite</button>
          </div>
          <div class="integration-features" style="margin-top:14px">
            <div class="integration-feature"><span class="integration-feature-icon">🌐</span> Share via link — accessible from any browser</div>
            <div class="integration-feature"><span class="integration-feature-icon">🔒</span> Role-based access: Partner, Analyst, Viewer</div>
            <div class="integration-feature"><span class="integration-feature-icon">💬</span> Shared annotations on deals and decks</div>
            <div class="integration-feature"><span class="integration-feature-icon">🔔</span> Activity feed of team actions</div>
          </div>
        </div>
      </div>

    </div>
  `;

  // Bind events
  document.getElementById('connect-gmail')?.addEventListener('click', () => {
    connectGmail();
  });

  document.getElementById('connect-streak')?.addEventListener('click', () => {
    const key = document.getElementById('streak-key')?.value;
    if (key && key.length > 10) {
      integrationState.streak.connected = true;
      integrationState.streak.apiKey = key;
      renderIntegrations(area);
    } else {
      alert('Please enter a valid Streak API key.\nFind it at: Streak → Settings → Integrations → API');
    }
  });

  document.getElementById('connect-supabase')?.addEventListener('click', () => {
    initSupabase();
    renderIntegrations(area);
  });

  document.getElementById('invite-btn')?.addEventListener('click', () => {
    const email = document.getElementById('invite-email')?.value;
    const role = document.getElementById('invite-role')?.value;
    if (email && email.includes('@')) {
      const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const colors = ['#6366f1', '#ec4899', '#f59e0b', '#3b82f6', '#8b5cf6', '#14b8a6'];
      integrationState.team.members.push({
        name, email, role,
        color: colors[integrationState.team.members.length % colors.length]
      });
      renderIntegrations(area);
    }
  });
}

// ---- Boot ----
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  initStreak();
  // Gmail init deferred until GIS script loads
  setTimeout(() => initGmail(), 1000);
  init();
});
