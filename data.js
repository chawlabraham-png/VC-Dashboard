// ============================================================
// Jungle Ventures — Deal Sourcing Engine: Startup Dataset
// Sectors: Consumer Tech & B2B Manufacturing
// Geographies: India, Singapore, Indonesia, Vietnam, Philippines
// ============================================================

var STARTUPS = [
  {
    id: "st-001",
    name: "KartBee",
    logo: "🛒",
    sector: "Consumer Tech",
    subSector: "Quick Commerce",
    geography: "India",
    city: "Bengaluru",
    founded: "2024-03",
    stage: "Pre-Seed",
    lastRound: { amount: 1.2, currency: "USD", type: "Angel", date: "2025-08" },
    founders: [
      { name: "Priya Rajan", role: "CEO", pedigree: "Ex-Swiggy (VP Eng), IIT Bombay", linkedIn: "#", previousExits: 1 },
      { name: "Arjun Mehta", role: "CTO", pedigree: "Ex-Flipkart (Staff Eng), Stanford CS", linkedIn: "#", previousExits: 0 }
    ],
    description: "AI-powered hyperlocal delivery for Tier-2 Indian cities, using autonomous route optimization to achieve 10-min delivery at 40% lower cost than incumbents.",
    signals: {
      hiringSpike: { score: 88, detail: "+34 roles in 30 days (eng + ops)", trend: [12, 14, 18, 22, 28, 34] },
      founderExit: { score: 95, detail: "Priya left Swiggy VP role Q3 2024" },
      viralTraction: { score: 72, detail: "Twitter thread hit 2.1M impressions, #KartBee trending" },
      appDownloads: { score: 81, detail: "48K downloads in first 45 days", trend: [2000, 5200, 8800, 12400, 19600, 48000] },
      githubActivity: { score: 35, detail: "Private repo, 12 contributors" },
      angelFunding: { score: 78, detail: "$1.2M from Kunal Shah, Binny Bansal, DST angel" }
    },
    metrics: { mau: 32000, mauGrowth: 340, revenue: 45000, revenueGrowth: 280, burnRate: 85000, runway: 14 },
    tam: 18,
    tamUnit: "B"
  },
  {
    id: "st-002",
    name: "FactoryOS",
    logo: "🏭",
    sector: "B2B Manufacturing",
    subSector: "Smart Factory Platform",
    geography: "India",
    city: "Pune",
    founded: "2024-06",
    stage: "Seed",
    lastRound: { amount: 3.5, currency: "USD", type: "Seed", date: "2025-11" },
    founders: [
      { name: "Vikram Desai", role: "CEO", pedigree: "Ex-Siemens (Dir. Digital), IIT Madras, Wharton MBA", linkedIn: "#", previousExits: 2 },
      { name: "Sneha Kulkarni", role: "CTO", pedigree: "Ex-Bosch IoT (Lead Architect), BITS Pilani", linkedIn: "#", previousExits: 0 }
    ],
    description: "End-to-end smart factory OS connecting legacy machines via retrofitted IoT sensors with real-time AI quality control, reducing defect rates by 60% and downtime by 45%.",
    signals: {
      hiringSpike: { score: 72, detail: "+18 roles (IoT eng + field sales)", trend: [5, 6, 8, 10, 14, 18] },
      founderExit: { score: 90, detail: "Vikram left Siemens Director role, 2 prior exits" },
      viralTraction: { score: 45, detail: "Featured in ET Manufacturing, 3 conf keynotes" },
      appDownloads: { score: 20, detail: "B2B — dashboard SaaS, 85 enterprise trials" },
      githubActivity: { score: 62, detail: "Open-source sensor SDK, 340 GitHub stars", trend: [40, 82, 140, 210, 280, 340] },
      angelFunding: { score: 85, detail: "$3.5M seed from Accel India + manufacturing angels" }
    },
    metrics: { mau: 85, mauGrowth: 120, revenue: 180000, revenueGrowth: 200, burnRate: 220000, runway: 16 },
    tam: 42,
    tamUnit: "B"
  },
  {
    id: "st-003",
    name: "Playlo",
    logo: "🎮",
    sector: "Consumer Tech",
    subSector: "Social Gaming",
    geography: "Indonesia",
    city: "Jakarta",
    founded: "2024-01",
    stage: "Pre-Series A",
    lastRound: { amount: 2.8, currency: "USD", type: "Seed", date: "2025-06" },
    founders: [
      { name: "Adi Pratama", role: "CEO", pedigree: "Ex-Gojek (Head of Games), UI Jakarta", linkedIn: "#", previousExits: 1 },
      { name: "Rina Wijaya", role: "CPO", pedigree: "Ex-Sea Group (Product Lead), NUS", linkedIn: "#", previousExits: 0 }
    ],
    description: "Mobile social gaming platform for Southeast Asia with real-time multiplayer casual games, in-game social commerce, and creator monetization tools.",
    signals: {
      hiringSpike: { score: 65, detail: "+22 roles (game devs + community)", trend: [8, 10, 12, 15, 18, 22] },
      founderExit: { score: 82, detail: "Adi built Gojek Games to 8M MAU before exit" },
      viralTraction: { score: 91, detail: "TikTok organic reach 12M, #Playlo challenge viral", trend: [500000, 1200000, 3400000, 5800000, 8900000, 12000000] },
      appDownloads: { score: 94, detail: "620K downloads in 90 days, #4 on Play Store ID", trend: [18000, 62000, 145000, 290000, 450000, 620000] },
      githubActivity: { score: 28, detail: "Closed source, 8 contributors" },
      angelFunding: { score: 70, detail: "$2.8M seed from East Ventures + angels" }
    },
    metrics: { mau: 410000, mauGrowth: 520, revenue: 28000, revenueGrowth: 180, burnRate: 150000, runway: 18 },
    tam: 24,
    tamUnit: "B"
  },
  {
    id: "st-004",
    name: "MeshWorks",
    logo: "⚙️",
    sector: "B2B Manufacturing",
    subSector: "Supply Chain Automation",
    geography: "Singapore",
    city: "Singapore",
    founded: "2024-09",
    stage: "Pre-Seed",
    lastRound: { amount: 0.8, currency: "USD", type: "Angel", date: "2025-12" },
    founders: [
      { name: "Wei Lin Tan", role: "CEO", pedigree: "Ex-Flex (VP Operations), NTU, INSEAD", linkedIn: "#", previousExits: 1 },
      { name: "Rajesh Nair", role: "CTO", pedigree: "Ex-SAP (Principal Eng), IISc Bangalore", linkedIn: "#", previousExits: 0 }
    ],
    description: "AI-native procurement and supply chain orchestration for mid-market manufacturers in ASEAN, automating supplier discovery, PO management, and logistics coordination.",
    signals: {
      hiringSpike: { score: 55, detail: "+9 roles (ML eng + supply chain ops)", trend: [2, 3, 4, 5, 7, 9] },
      founderExit: { score: 85, detail: "Wei Lin ran $2B supply chain at Flex" },
      viralTraction: { score: 38, detail: "LinkedIn thought leadership, 15K followers" },
      appDownloads: { score: 15, detail: "B2B SaaS — 24 pilot customers" },
      githubActivity: { score: 48, detail: "Open-source EDI connector, 180 stars", trend: [20, 45, 78, 110, 150, 180] },
      angelFunding: { score: 65, detail: "$800K angel from Iterative + operators" }
    },
    metrics: { mau: 24, mauGrowth: 100, revenue: 42000, revenueGrowth: 310, burnRate: 95000, runway: 8 },
    tam: 35,
    tamUnit: "B"
  },
  {
    id: "st-005",
    name: "Chowbus SEA",
    logo: "🍜",
    sector: "Consumer Tech",
    subSector: "Food Tech",
    geography: "Vietnam",
    city: "Ho Chi Minh City",
    founded: "2024-04",
    stage: "Seed",
    lastRound: { amount: 2.0, currency: "USD", type: "Seed", date: "2025-09" },
    founders: [
      { name: "Linh Nguyen", role: "CEO", pedigree: "Ex-Grab (Country Head Vietnam), Harvard MBA", linkedIn: "#", previousExits: 0 },
      { name: "Minh Tran", role: "CTO", pedigree: "Ex-Shopee (Eng Lead), CMU", linkedIn: "#", previousExits: 1 }
    ],
    description: "Premium cloud kitchen network for Vietnam's growing middle class, combining AI demand forecasting with centralized kitchen operations to serve 50+ virtual brands.",
    signals: {
      hiringSpike: { score: 78, detail: "+28 roles (kitchen ops + tech)", trend: [8, 12, 15, 19, 24, 28] },
      founderExit: { score: 88, detail: "Linh was Grab Vietnam Country Head" },
      viralTraction: { score: 68, detail: "Featured food influencer collab, 4.5M reach" },
      appDownloads: { score: 76, detail: "92K downloads in 60 days", trend: [5000, 14000, 28000, 48000, 72000, 92000] },
      githubActivity: { score: 22, detail: "Closed source" },
      angelFunding: { score: 75, detail: "$2M seed from Golden Gate Ventures + F&B angels" }
    },
    metrics: { mau: 58000, mauGrowth: 290, revenue: 120000, revenueGrowth: 340, burnRate: 180000, runway: 11 },
    tam: 12,
    tamUnit: "B"
  },
  {
    id: "st-006",
    name: "QualityLens",
    logo: "🔍",
    sector: "B2B Manufacturing",
    subSector: "Visual Inspection AI",
    geography: "India",
    city: "Chennai",
    founded: "2023-11",
    stage: "Series A",
    lastRound: { amount: 8.0, currency: "USD", type: "Series A", date: "2026-01" },
    founders: [
      { name: "Deepak Sundaram", role: "CEO", pedigree: "Ex-Google Brain (Research Scientist), IIT Kharagpur, PhD Stanford", linkedIn: "#", previousExits: 1 },
      { name: "Kavitha Ram", role: "COO", pedigree: "Ex-Tata Steel (Head Quality), IIM Ahmedabad", linkedIn: "#", previousExits: 0 }
    ],
    description: "Computer vision platform for real-time manufactured goods inspection, deployed on-edge at factory lines. Detects micro-defects at 99.4% accuracy, 100x faster than human QC.",
    signals: {
      hiringSpike: { score: 82, detail: "+26 roles (CV engineers + enterprise sales)", trend: [8, 10, 14, 18, 22, 26] },
      founderExit: { score: 92, detail: "Deepak published 14 papers at Google Brain, 1 prior exit" },
      viralTraction: { score: 52, detail: "TechCrunch feature, YC demo day finalist" },
      appDownloads: { score: 18, detail: "B2B — 42 enterprise deployments" },
      githubActivity: { score: 75, detail: "Open-source defect detection model, 1.2K stars", trend: [120, 340, 560, 780, 980, 1200] },
      angelFunding: { score: 92, detail: "$8M Series A led by Lightspeed India" }
    },
    metrics: { mau: 42, mauGrowth: 90, revenue: 680000, revenueGrowth: 180, burnRate: 350000, runway: 22 },
    tam: 28,
    tamUnit: "B"
  },
  {
    id: "st-007",
    name: "Finfolk",
    logo: "💳",
    sector: "Consumer Tech",
    subSector: "Embedded Finance",
    geography: "Philippines",
    city: "Manila",
    founded: "2024-07",
    stage: "Pre-Seed",
    lastRound: { amount: 0.6, currency: "USD", type: "Angel", date: "2025-10" },
    founders: [
      { name: "Marco Santos", role: "CEO", pedigree: "Ex-PayMaya (Head Product), Ateneo, Wharton", linkedIn: "#", previousExits: 0 },
      { name: "Ana Reyes", role: "CTO", pedigree: "Ex-Ant Financial (Senior Eng), UP Diliman", linkedIn: "#", previousExits: 0 }
    ],
    description: "Embedded lending-as-a-service for Philippine SMEs, enabling any marketplace or SaaS platform to offer instant credit at point-of-sale via a single API.",
    signals: {
      hiringSpike: { score: 42, detail: "+7 roles (backend eng + compliance)", trend: [2, 2, 3, 4, 5, 7] },
      founderExit: { score: 70, detail: "Marco built PayMaya's merchant lending product" },
      viralTraction: { score: 55, detail: "Featured in DealStreetAsia, Rappler tech column" },
      appDownloads: { score: 30, detail: "B2B API — 18 platform integrations" },
      githubActivity: { score: 58, detail: "Open-source SDK, 220 stars", trend: [25, 55, 90, 130, 175, 220] },
      angelFunding: { score: 55, detail: "$600K angel from Kaszek scout + local angels" }
    },
    metrics: { mau: 18, mauGrowth: 160, revenue: 22000, revenueGrowth: 420, burnRate: 65000, runway: 9 },
    tam: 8,
    tamUnit: "B"
  },
  {
    id: "st-008",
    name: "MateriFlow",
    logo: "🧪",
    sector: "B2B Manufacturing",
    subSector: "Materials Marketplace",
    geography: "Indonesia",
    city: "Surabaya",
    founded: "2024-02",
    stage: "Seed",
    lastRound: { amount: 4.0, currency: "USD", type: "Seed", date: "2025-07" },
    founders: [
      { name: "Budi Hartono", role: "CEO", pedigree: "Ex-Astra International (VP Procurement), ITB, Kellogg MBA", linkedIn: "#", previousExits: 1 },
      { name: "Sari Dewi", role: "CTO", pedigree: "Ex-Tokopedia (Eng Manager), ITS Surabaya", linkedIn: "#", previousExits: 0 }
    ],
    description: "B2B raw materials marketplace for Indonesian manufacturers with integrated logistics, quality assurance, and trade financing — the 'Alibaba for Indonesian factories'.",
    signals: {
      hiringSpike: { score: 70, detail: "+20 roles (logistics ops + marketplace eng)", trend: [5, 7, 10, 13, 16, 20] },
      founderExit: { score: 86, detail: "Budi managed $1.5B procurement at Astra, 1 exit" },
      viralTraction: { score: 48, detail: "Keynote at Manufacturing Indonesia 2025" },
      appDownloads: { score: 25, detail: "B2B platform — 340 active manufacturers" },
      githubActivity: { score: 32, detail: "Closed source, API docs public" },
      angelFunding: { score: 82, detail: "$4M seed from Openspace + SMDV" }
    },
    metrics: { mau: 340, mauGrowth: 150, revenue: 290000, revenueGrowth: 240, burnRate: 200000, runway: 20 },
    tam: 55,
    tamUnit: "B"
  },
  {
    id: "st-009",
    name: "Vybe",
    logo: "🎵",
    sector: "Consumer Tech",
    subSector: "Creator Economy",
    geography: "India",
    city: "Mumbai",
    founded: "2024-08",
    stage: "Pre-Seed",
    lastRound: { amount: 1.5, currency: "USD", type: "Angel", date: "2025-11" },
    founders: [
      { name: "Aisha Khan", role: "CEO", pedigree: "Ex-ShareChat (Head Creator Partnerships), NMIMS", linkedIn: "#", previousExits: 0 },
      { name: "Rohan Deshpande", role: "CTO", pedigree: "Ex-Spotify (Senior Eng), IIT Delhi", linkedIn: "#", previousExits: 0 }
    ],
    description: "AI-powered short video platform for India's Bharat creators (vernacular), with built-in monetization, brand matchmaking, and automated dubbing across 12 Indian languages.",
    signals: {
      hiringSpike: { score: 80, detail: "+30 roles (AI/ML + creator success)", trend: [6, 10, 15, 20, 25, 30] },
      founderExit: { score: 75, detail: "Aisha scaled ShareChat creator base to 2M+" },
      viralTraction: { score: 88, detail: "Organic TikTok/Insta reach 8M, creator waitlist 45K", trend: [400000, 1200000, 2800000, 4500000, 6200000, 8000000] },
      appDownloads: { score: 85, detail: "210K downloads in 75 days", trend: [8000, 28000, 62000, 110000, 165000, 210000] },
      githubActivity: { score: 40, detail: "Open-source dubbing model, 280 stars" },
      angelFunding: { score: 72, detail: "$1.5M from Cred angels + media operators" }
    },
    metrics: { mau: 185000, mauGrowth: 410, revenue: 15000, revenueGrowth: 600, burnRate: 120000, runway: 12 },
    tam: 20,
    tamUnit: "B"
  },
  {
    id: "st-010",
    name: "RoboWeld",
    logo: "🤖",
    sector: "B2B Manufacturing",
    subSector: "Industrial Robotics",
    geography: "Vietnam",
    city: "Hanoi",
    founded: "2023-08",
    stage: "Series A",
    lastRound: { amount: 6.5, currency: "USD", type: "Series A", date: "2025-12" },
    founders: [
      { name: "Duc Pham", role: "CEO", pedigree: "Ex-Fanuc (R&D Lead APAC), Hanoi UT, MIT Robotics PhD", linkedIn: "#", previousExits: 1 },
      { name: "Thao Le", role: "COO", pedigree: "Ex-Samsung Vietnam (Factory Director), VNU", linkedIn: "#", previousExits: 0 }
    ],
    description: "Affordable collaborative welding robots for ASEAN SME factories, 70% cheaper than Fanuc/ABB with AI-assisted programming that reduces setup time from days to hours.",
    signals: {
      hiringSpike: { score: 76, detail: "+15 roles (robotics eng + field deployment)", trend: [4, 6, 8, 10, 12, 15] },
      founderExit: { score: 94, detail: "Duc led Fanuc's APAC R&D, MIT PhD, 1 exit" },
      viralTraction: { score: 42, detail: "Demo video viral in manufacturing LinkedIn (800K views)" },
      appDownloads: { score: 12, detail: "B2B hardware — 65 units deployed" },
      githubActivity: { score: 70, detail: "Open-source robot control SDK, 890 stars", trend: [80, 210, 380, 540, 720, 890] },
      angelFunding: { score: 88, detail: "$6.5M Series A from Wavemaker + strategic industrials" }
    },
    metrics: { mau: 65, mauGrowth: 85, revenue: 520000, revenueGrowth: 160, burnRate: 280000, runway: 23 },
    tam: 38,
    tamUnit: "B"
  },
  {
    id: "st-011",
    name: "ShopHero",
    logo: "🦸",
    sector: "Consumer Tech",
    subSector: "Social Commerce",
    geography: "Vietnam",
    city: "Hanoi",
    founded: "2024-05",
    stage: "Seed",
    lastRound: { amount: 2.5, currency: "USD", type: "Seed", date: "2025-10" },
    founders: [
      { name: "Trang Bui", role: "CEO", pedigree: "Ex-Tiki (VP Growth), Foreign Trade University, Berkeley MBA", linkedIn: "#", previousExits: 0 },
      { name: "Khanh Do", role: "CTO", pedigree: "Ex-VNG (Staff Eng), HUST", linkedIn: "#", previousExits: 0 }
    ],
    description: "Livestream social commerce platform for Vietnam, enabling micro-influencers to sell directly to followers with integrated payments, logistics, and AI-powered product recommendations.",
    signals: {
      hiringSpike: { score: 62, detail: "+16 roles (growth + streaming infra)", trend: [4, 6, 8, 10, 13, 16] },
      founderExit: { score: 78, detail: "Trang grew Tiki marketplace GMV 4x in 2 years" },
      viralTraction: { score: 82, detail: "Viral Zalo campaign, 6M impressions, creator FOMO", trend: [300000, 800000, 1800000, 3200000, 4800000, 6000000] },
      appDownloads: { score: 79, detail: "155K downloads in 80 days", trend: [6000, 22000, 52000, 88000, 125000, 155000] },
      githubActivity: { score: 20, detail: "Closed source" },
      angelFunding: { score: 68, detail: "$2.5M seed from Do Ventures + angels" }
    },
    metrics: { mau: 98000, mauGrowth: 320, revenue: 85000, revenueGrowth: 380, burnRate: 140000, runway: 17 },
    tam: 15,
    tamUnit: "B"
  },
  {
    id: "st-012",
    name: "PackBot",
    logo: "📦",
    sector: "B2B Manufacturing",
    subSector: "Packaging Automation",
    geography: "India",
    city: "Ahmedabad",
    founded: "2024-01",
    stage: "Seed",
    lastRound: { amount: 3.0, currency: "USD", type: "Seed", date: "2025-08" },
    founders: [
      { name: "Harsh Patel", role: "CEO", pedigree: "Ex-Uflex (CTO), IIT Roorkee, Georgia Tech MS", linkedIn: "#", previousExits: 1 },
      { name: "Neeta Shah", role: "COO", pedigree: "Ex-HUL (Head Packaging), IIMA", linkedIn: "#", previousExits: 0 }
    ],
    description: "Modular AI-driven packaging automation systems for Indian FMCG and pharma manufacturers, reducing packaging waste by 35% and labor costs by 50% with quick-swap robotic cells.",
    signals: {
      hiringSpike: { score: 68, detail: "+14 roles (robotics + enterprise BD)", trend: [3, 5, 7, 9, 11, 14] },
      founderExit: { score: 88, detail: "Harsh was CTO of India's largest flex-pack company" },
      viralTraction: { score: 40, detail: "Industry awards, PackTech Asia speaker" },
      appDownloads: { score: 10, detail: "B2B hardware+software — 28 deployments" },
      githubActivity: { score: 45, detail: "Open-source packaging optimizer lib, 160 stars" },
      angelFunding: { score: 78, detail: "$3M seed from Blume + packaging industry angels" }
    },
    metrics: { mau: 28, mauGrowth: 75, revenue: 380000, revenueGrowth: 190, burnRate: 190000, runway: 15 },
    tam: 22,
    tamUnit: "B"
  },
  {
    id: "st-013",
    name: "NomNom",
    logo: "🍱",
    sector: "Consumer Tech",
    subSector: "D2C Food",
    geography: "Singapore",
    city: "Singapore",
    founded: "2024-10",
    stage: "Pre-Seed",
    lastRound: { amount: 0.9, currency: "USD", type: "Angel", date: "2026-01" },
    founders: [
      { name: "Rachel Lim", role: "CEO", pedigree: "Ex-Grab (Head GrabFood SG), SMU, Columbia MBA", linkedIn: "#", previousExits: 0 },
      { name: "Jason Teo", role: "CTO", pedigree: "Ex-Shopback (Eng Lead), NUS", linkedIn: "#", previousExits: 0 }
    ],
    description: "Personalized meal subscription for health-conscious SEA consumers, using AI nutrition planning and ghost kitchen network to deliver macro-optimized meals daily.",
    signals: {
      hiringSpike: { score: 50, detail: "+8 roles (ops + nutrition science)", trend: [2, 3, 4, 5, 6, 8] },
      founderExit: { score: 80, detail: "Rachel ran GrabFood Singapore P&L" },
      viralTraction: { score: 70, detail: "Instagram fitness influencer partnerships, 3.2M reach" },
      appDownloads: { score: 65, detail: "35K downloads in 45 days", trend: [1500, 5000, 11000, 18000, 26000, 35000] },
      githubActivity: { score: 18, detail: "Closed source" },
      angelFunding: { score: 60, detail: "$900K from Antler + health-tech angels" }
    },
    metrics: { mau: 12000, mauGrowth: 280, revenue: 65000, revenueGrowth: 350, burnRate: 75000, runway: 12 },
    tam: 9,
    tamUnit: "B"
  },
  {
    id: "st-014",
    name: "SteelMind",
    logo: "🔩",
    sector: "B2B Manufacturing",
    subSector: "Predictive Maintenance",
    geography: "India",
    city: "Jamshedpur",
    founded: "2023-06",
    stage: "Series A",
    lastRound: { amount: 7.0, currency: "USD", type: "Series A", date: "2025-10" },
    founders: [
      { name: "Amit Sinha", role: "CEO", pedigree: "Ex-Tata Steel (Chief Digital Officer), IIT BHU, MIT Sloan", linkedIn: "#", previousExits: 2 },
      { name: "Prachi Gupta", role: "CTO", pedigree: "Ex-GE Digital (Principal Data Scientist), ISI Kolkata", linkedIn: "#", previousExits: 0 }
    ],
    description: "AI-powered predictive maintenance platform for heavy industry, using vibration analysis and thermal imaging to predict equipment failures 72 hours in advance with 96% accuracy.",
    signals: {
      hiringSpike: { score: 85, detail: "+28 roles (data science + field eng)", trend: [6, 10, 14, 18, 23, 28] },
      founderExit: { score: 96, detail: "Amit was CDO at Tata Steel, 2 prior exits (both acquired)" },
      viralTraction: { score: 48, detail: "Case study with JSW Steel went viral in industry" },
      appDownloads: { score: 15, detail: "B2B — 38 plant deployments across 12 companies" },
      githubActivity: { score: 68, detail: "Open-source vibration analysis toolkit, 780 stars", trend: [100, 220, 380, 510, 650, 780] },
      angelFunding: { score: 90, detail: "$7M Series A led by Matrix Partners India" }
    },
    metrics: { mau: 38, mauGrowth: 65, revenue: 920000, revenueGrowth: 140, burnRate: 400000, runway: 17 },
    tam: 32,
    tamUnit: "B"
  },
  {
    id: "st-015",
    name: "PixelPay",
    logo: "📱",
    sector: "Consumer Tech",
    subSector: "Gen-Z Fintech",
    geography: "India",
    city: "Delhi NCR",
    founded: "2024-11",
    stage: "Pre-Seed",
    lastRound: { amount: 1.0, currency: "USD", type: "Angel", date: "2026-02" },
    founders: [
      { name: "Aryan Kapoor", role: "CEO", pedigree: "Ex-CRED (Product Lead), IIT Delhi, Y Combinator alum", linkedIn: "#", previousExits: 0 },
      { name: "Diya Sharma", role: "CTO", pedigree: "Ex-Razorpay (Senior Eng), IIIT Hyderabad", linkedIn: "#", previousExits: 0 }
    ],
    description: "Gamified savings and investing app for India's Gen-Z, turning financial habits into social challenges with streak rewards, friend leaderboards, and micro-SIP automation.",
    signals: {
      hiringSpike: { score: 58, detail: "+11 roles (mobile eng + growth)", trend: [3, 4, 5, 7, 9, 11] },
      founderExit: { score: 72, detail: "Aryan built CRED's rewards engine, YC W24" },
      viralTraction: { score: 92, detail: "Instagram Reels campaign 15M views, waitlist 120K", trend: [600000, 2200000, 5100000, 8400000, 12000000, 15000000] },
      appDownloads: { score: 78, detail: "88K downloads in 30 days (invite-only)", trend: [4000, 12000, 28000, 48000, 68000, 88000] },
      githubActivity: { score: 30, detail: "Closed source, 6 contributors" },
      angelFunding: { score: 62, detail: "$1M from Kunal Shah + CRED mafia angels" }
    },
    metrics: { mau: 68000, mauGrowth: 480, revenue: 8000, revenueGrowth: 800, burnRate: 90000, runway: 11 },
    tam: 14,
    tamUnit: "B"
  },
  {
    id: "st-016",
    name: "GreenMill",
    logo: "♻️",
    sector: "B2B Manufacturing",
    subSector: "Sustainable Manufacturing",
    geography: "Singapore",
    city: "Singapore",
    founded: "2024-03",
    stage: "Seed",
    lastRound: { amount: 5.0, currency: "USD", type: "Seed", date: "2025-09" },
    founders: [
      { name: "Chen Wei", role: "CEO", pedigree: "Ex-Shell (Head Sustainability APAC), Imperial College, Stanford MBA", linkedIn: "#", previousExits: 1 },
      { name: "Ayu Tanaka", role: "CTO", pedigree: "Ex-ABB (IoT Architect), Tokyo Tech, NUS PhD", linkedIn: "#", previousExits: 0 }
    ],
    description: "Carbon accounting and energy optimization platform for ASEAN manufacturers, turning ESG compliance from cost center to profit driver with AI-powered energy reduction playbooks.",
    signals: {
      hiringSpike: { score: 74, detail: "+19 roles (sustainability consultants + eng)", trend: [4, 7, 10, 13, 16, 19] },
      founderExit: { score: 87, detail: "Chen led Shell's $500M APAC sustainability transformation" },
      viralTraction: { score: 55, detail: "COP28 side event speaker, Bloomberg Green feature" },
      appDownloads: { score: 20, detail: "B2B SaaS — 62 enterprise clients" },
      githubActivity: { score: 58, detail: "Open-source carbon calculator, 310 stars", trend: [35, 80, 140, 200, 260, 310] },
      angelFunding: { score: 80, detail: "$5M seed from Temasek-linked angels + Wavemaker" }
    },
    metrics: { mau: 62, mauGrowth: 95, revenue: 240000, revenueGrowth: 210, burnRate: 250000, runway: 20 },
    tam: 48,
    tamUnit: "B"
  }
];

var SIGNAL_TYPES = [
  { key: "hiringSpike", label: "Hiring Spike", icon: "👥", color: "#6366f1" },
  { key: "founderExit", label: "Founder Exit", icon: "🚀", color: "#f59e0b" },
  { key: "viralTraction", label: "Viral Traction", icon: "📈", color: "#ec4899" },
  { key: "appDownloads", label: "App Downloads", icon: "📲", color: "#10b981" },
  { key: "githubActivity", label: "GitHub Activity", icon: "💻", color: "#8b5cf6" },
  { key: "angelFunding", label: "Angel Funding", icon: "💰", color: "#f97316" }
];

var GEOGRAPHIES = ["All", "India", "Singapore", "Indonesia", "Vietnam", "Philippines"];
var SECTORS = ["All", "Consumer Tech", "B2B Manufacturing"];

// Globals: STARTUPS, SIGNAL_TYPES, GEOGRAPHIES, SECTORS
