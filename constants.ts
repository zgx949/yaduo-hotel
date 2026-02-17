
import { AccountStatus, AccountTier, BookingType, HotelAccount, Hotel, Order, PriceAlert, PriceMonitorTask, BlacklistRecord, SystemUser, SystemConfig } from "./types";

const today = new Date().toISOString().split('T')[0];
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

export const POPULAR_CITIES = [
  '上海市', '北京市', '深圳市', '广州市', '杭州市', '成都市', '南京市', '武汉市', '西安市', '重庆市', '苏州市', '长沙市'
];

export const CORPORATE_COMPANIES = [
  '阿里巴巴', '腾讯科技', '字节跳动', '华为技术', '百度', '美团', '京东', '网易', '小米', '滴滴出行'
];

export const VALUE_ADDED_SERVICES = [
  { id: 'pillow', name: '深睡枕Pro', icon: '🛏️', desc: '舒缓颈椎', image: 'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=100&h=100&fit=crop' },
  { id: 'mask', name: '静夜好眠', icon: '🌙', desc: '蒸汽眼罩', image: 'https://images.unsplash.com/photo-1519415943484-9fa1873496d4?w=100&h=100&fit=crop' },
  { id: 'heat', name: '轻暖颈贴', icon: '🔥', desc: '缓解疲劳', image: 'https://images.unsplash.com/photo-1515814472071-4d632ff9673d?w=100&h=100&fit=crop' },
  { id: 'milk', name: '晚安牛奶', icon: '🥛', desc: '温热助眠', image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=100&h=100&fit=crop' },
  { id: 'incense', name: '榉木香薰', icon: '🪵', desc: '自然香氛', image: 'https://images.unsplash.com/photo-1608571423902-eed4a5e84d85?w=100&h=100&fit=crop' },
];

export const MOCK_ACCOUNTS: HotelAccount[] = [
  { 
    id: '1', 
    phone: '138****1234', 
    tier: AccountTier.PLATINUM, 
    points: 12500, 
    coupons: { breakfast: 2, upgrade: 1, lateCheckout: 2, slippers: 0 }, 
    status: AccountStatus.ACTIVE, 
    dailyOrdersLeft: 6,
    lastExecution: { checkIn: `${today}T08:00:00`, lottery: `${today}T08:01:00`, scan: `${today}T12:00:00` },
    lastResult: { checkIn: '签到成功 +50积分', lottery: '很遗憾，未中奖', scan: '扫描完毕，无新增' }
  },
  { 
    id: '2', 
    phone: '139****5678', 
    tier: AccountTier.CORPORATE, 
    corporateName: '阿里巴巴',
    points: 5400, 
    coupons: { breakfast: 0, upgrade: 0, lateCheckout: 1, slippers: 5 }, 
    status: AccountStatus.ACTIVE, 
    dailyOrdersLeft: 2,
    lastExecution: { checkIn: `${today}T09:30:00`, lottery: `${yesterday}T09:30:00`, scan: `${today}T10:00:00` },
    lastResult: { checkIn: '签到成功 +10积分', lottery: '昨日: 获得拖鞋券x1', scan: '整理过期券 3 张' }
  },
  { 
    id: '3', 
    phone: '150****9012', 
    tier: AccountTier.NEW_USER, 
    points: 0, 
    coupons: { breakfast: 1, upgrade: 0, lateCheckout: 0, slippers: 0 }, 
    status: AccountStatus.RESTRICTED, 
    dailyOrdersLeft: 0,
    lastExecution: {},
    lastResult: {}
  },
  { 
    id: '4', 
    phone: '186****3344', 
    tier: AccountTier.CO_PLATINUM, 
    points: 50000, 
    coupons: { breakfast: 5, upgrade: 3, lateCheckout: 5, slippers: 2 }, 
    status: AccountStatus.OFFLINE, 
    dailyOrdersLeft: 10,
    lastExecution: { checkIn: `${yesterday}T20:00:00`, lottery: `${yesterday}T20:00:00`, scan: `${yesterday}T20:00:00` },
    lastResult: { checkIn: '昨日已签', lottery: '昨日已抽', scan: '无' }
  },
  { 
    id: '5', 
    phone: '135****9988', 
    tier: AccountTier.CORPORATE, 
    corporateName: '腾讯科技',
    points: 8800, 
    coupons: { breakfast: 1, upgrade: 1, lateCheckout: 0, slippers: 10 }, 
    status: AccountStatus.ACTIVE, 
    dailyOrdersLeft: 5,
    lastExecution: { checkIn: `${today}T07:15:00`, lottery: `${today}T07:16:00`, scan: `${today}T07:20:00` },
    lastResult: { checkIn: '签到成功 +20积分', lottery: '中奖：早餐券 x1', scan: '同步成功' }
  },
];

export const MOCK_ORDERS: Order[] = [
  { 
    id: 'ORD-001', 
    hotelName: '上海金茂君悦大酒店', 
    hotelAddress: '上海市浦东新区世纪大道88号金茂大厦',
    roomType: '江景大床房',
    customerName: '张三', 
    checkIn: tomorrow, 
    checkOut: nextWeek, 
    price: 2400, 
    status: 'WAITING_CHECKIN', 
    type: BookingType.PLATINUM, 
    invoiceRequested: false, 
    invoiceIssued: false, 
    createdAt: yesterday,
    tags: ['铂金立减', '含双早'],
    creatorId: 'user-002',
    creatorName: '张业务'
  },
  { 
    id: 'ORD-002', 
    hotelName: '北京亚朵S酒店(国贸店)', 
    hotelAddress: '北京市朝阳区建国门外大街1号',
    roomType: '几木双床房',
    customerName: '李四', 
    checkIn: yesterday, 
    checkOut: today, 
    price: 650, 
    status: 'COMPLETED', 
    type: BookingType.CORPORATE, 
    invoiceRequested: false, 
    invoiceIssued: false, 
    createdAt: '2023-10-20',
    tags: ['企业协议'],
    creatorId: 'user-003',
    creatorName: '实习生小李'
  },
  { 
    id: 'ORD-003', 
    hotelName: '广州W酒店', 
    hotelAddress: '广州市天河区珠江新城冼村路26号',
    roomType: '奇妙客房',
    customerName: '王五', 
    checkIn: nextWeek, 
    checkOut: nextWeek, 
    price: 1800, 
    status: 'UNPAID', 
    type: BookingType.NEW_USER, 
    invoiceRequested: false, 
    invoiceIssued: false, 
    createdAt: today,
    tags: ['首单立减'],
    creatorId: 'user-002',
    creatorName: '张业务'
  },
  { 
    id: 'ORD-004', 
    hotelName: '杭州西湖索菲特大酒店', 
    hotelAddress: '杭州市上城区西湖大道333号',
    roomType: '豪华湖景房',
    customerName: '赵六', 
    checkIn: tomorrow, 
    checkOut: nextWeek, 
    price: 1200, 
    status: 'WAITING_CHECKIN', 
    type: BookingType.PLATINUM, 
    invoiceRequested: true, 
    invoiceIssued: false, 
    createdAt: yesterday,
    tags: ['免费升房', '延迟退房'],
    creatorId: 'user-001',
    creatorName: '超级管理员'
  },
  { 
    id: 'ORD-005', 
    hotelName: '深圳南山科技园亚朵酒店', 
    hotelAddress: '深圳市南山区高新南一道',
    roomType: '高级大床房',
    customerName: '孙七', 
    checkIn: '2023-10-01', 
    checkOut: '2023-10-02', 
    price: 580, 
    status: 'CANCELLED', 
    type: BookingType.NORMAL, 
    invoiceRequested: false, 
    invoiceIssued: false, 
    createdAt: '2023-09-30',
    tags: [],
    creatorId: 'user-003',
    creatorName: '实习生小李'
  },
];

export const MOCK_ALERTS: PriceAlert[] = [
  { id: 'ALT-1', hotelName: '万豪市中心酒店', targetPrice: 800, currentPrice: 750, date: '2023-11-10' },
  { id: 'ALT-2', hotelName: '喜来登大酒店', targetPrice: 1200, currentPrice: 1350, date: '2023-11-12' },
];

export const MOCK_BLACKLIST: BlacklistRecord[] = [
  { id: 'BL-01', chainId: 'ATOUR', hotelName: '上海人民广场大世界地铁站亚朵酒店', reason: '前台态度极差，拒绝查单，且卫生间有异味。', severity: 'MEDIUM', tags: ['态度恶劣', '卫生差'], reportedBy: 'Agent-007', date: '2023-10-05', status: 'ACTIVE', source: 'manual' },
  { id: 'BL-02', chainId: 'UNKNOWN', hotelName: '北京某快捷酒店', reason: '虚假宣传，无窗房当有窗卖，客户投诉退款难。', severity: 'HIGH', tags: ['虚假宣传', '退款难'], reportedBy: 'Agent-Alice', date: '2023-09-15', status: 'ACTIVE', source: 'manual' },
  { id: 'BL-03', chainId: 'ATOUR', hotelName: '上海人民广场大世界地铁站亚朵酒店', reason: '客户反馈半夜有装修噪音，酒店拒绝协调换房。', severity: 'MEDIUM', tags: ['噪音', '服务差'], reportedBy: 'Agent-Bob', date: '2023-10-08', status: 'ACTIVE', source: 'manual' },
  { id: 'BL-04', chainId: 'ATOUR', hotelName: '上海人民广场大世界地铁站亚朵酒店', reason: '早餐非常敷衍，牛奶是兑水的。', severity: 'LOW', tags: ['餐饮差'], reportedBy: 'Agent-Cat', date: '2023-10-12', status: 'ACTIVE', source: 'manual' },
  { id: 'BL-05', chainId: 'VIENNA', hotelName: '深圳北站维也纳酒店', reason: '前台私下索要客户好评，否则不给退押金。', severity: 'HIGH', tags: ['违规操作', '扣押金'], reportedBy: 'Agent-David', date: '2023-11-01', status: 'ACTIVE', source: 'manual' },
];

export const MOCK_HOTELS: Hotel[] = [
  {
    id: 'h1',
    name: '上海人民广场大世界地铁站亚朵酒店',
    location: '上海市·黄浦区',
    address: '上海市黄浦区金陵东路500号亚龙国际广场7F',
    score: 4.9,
    reviews: 4505,
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80',
    tags: ['外宾适用', '直播投屏', '智能机器人', '吕蒙路早', '养生早餐', '深睡配方'],
    minPrice: 635,
    blacklistCount: 3, // Mocking blacklist count
    rooms: [
      {
        id: 'r1',
        name: '雅致大床房',
        image: 'https://images.unsplash.com/photo-1590490360182-c87295ec4232?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
        size: '20m²',
        bed: '1.5m大床',
        window: '外窗',
        tags: ['旋风升房', '深睡配方'],
        rates: [
          { id: 'rt1', name: '新客首单专享', price: 588, originalPrice: 759, type: BookingType.NEW_USER, tags: ['首单立减', '免费取消'] },
          { id: 'rt2', name: '企业协议价', price: 610, originalPrice: 759, type: BookingType.CORPORATE, tags: ['免押金', '延迟退房'] },
          { id: 'rt3', name: '铂金会员立减', price: 635, originalPrice: 759, type: BookingType.PLATINUM, tags: ['含双早', '房型升级'] },
          { id: 'rt4', name: '标准预订', price: 759, type: BookingType.NORMAL, tags: ['含早'] }
        ]
      },
      {
        id: 'r2',
        name: '几木双床房',
        image: 'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
        size: '35m²',
        bed: '1.2m双床',
        window: '落地窗',
        tags: ['几木权益', '免费MiniBar'],
        rates: [
          { id: 'rt5', name: '企业协议价', price: 720, originalPrice: 880, type: BookingType.CORPORATE, tags: ['免押金'] },
          { id: 'rt6', name: '铂金会员立减', price: 750, originalPrice: 880, type: BookingType.PLATINUM, tags: ['含双早', '视房态升房'] }
        ]
      }
    ]
  },
  {
    id: 'h2',
    name: '上海陆家嘴中心亚朵S酒店',
    location: '上海市·浦东新区',
    address: '上海市浦东新区浦东南路1111号',
    score: 4.8,
    reviews: 2380,
    image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80',
    tags: ['设计感公共空间', '打卡落日阳台', '免费停车场', '竹居上新'],
    minPrice: 820,
    rooms: [
      {
        id: 'r3',
        name: '高级行政大床房',
        image: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
        size: '30m²',
        bed: '1.8m大床',
        window: '全景落地窗',
        tags: ['行政礼遇', '浴缸'],
        rates: [
          { id: 'rt7', name: '企业协议价', price: 820, originalPrice: 1050, type: BookingType.CORPORATE, tags: ['含单早'] },
          { id: 'rt8', name: '标准预订', price: 1050, type: BookingType.NORMAL, tags: ['无早'] }
        ]
      }
    ]
  },
  {
    id: 'h3',
    name: '北京天安门亚朵酒店',
    location: '北京市·东城区',
    address: '北京市东城区东长安街1号',
    score: 4.7,
    reviews: 1200,
    image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?ixlib=rb-4.0.3&auto=format&fit=crop&w=1494&q=80',
    tags: ['位置优越', '看升旗', '人文书店'],
    minPrice: 950,
    rooms: [
      {
        id: 'r4',
        name: '景观大床房',
        image: 'https://images.unsplash.com/photo-1595576508898-0ad5c879a061?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=60',
        size: '28m²',
        bed: '1.8m大床',
        window: '外窗',
        tags: [],
        rates: [
           { id: 'rt9', name: '标准预订', price: 950, type: BookingType.NORMAL, tags: [] }
        ]
      }
    ]
  }
];

export const MOCK_MONITORS: PriceMonitorTask[] = [
  {
    id: 'MON-101',
    hotelName: '上海和平饭店',
    roomType: '费尔蒙大床房',
    checkIn: '2024-02-10',
    checkOut: '2024-02-11',
    targetPrice: 2800,
    currentPrice: 3200,
    hasInventory: true,
    status: 'MONITORING',
    note: 'VIP客户张总，春节前务必蹲到低价',
    lastUpdated: '10分钟前',
    historyDaily: [
        { date: '01-18', open: 3400, close: 3450, high: 3480, low: 3380 },
        { date: '01-19', open: 3450, close: 3350, high: 3480, low: 3300 },
        { date: '01-20', open: 3350, close: 3300, high: 3380, low: 3250 },
        { date: '01-21', open: 3300, close: 3100, high: 3320, low: 3080 },
        { date: '01-22', open: 3100, close: 3200, high: 3250, low: 3050 },
        { date: '01-23', open: 3200, close: 3250, high: 3300, low: 3180 },
        { date: '01-24', open: 3250, close: 3200, high: 3280, low: 3150 },
        { date: '01-25', open: 3200, close: 3200, high: 3250, low: 3150 }
    ],
    historyIntraday: [
        { time: '08:00', price: 3200 },
        { time: '09:00', price: 3180 },
        { time: '10:00', price: 3150 },
        { time: '11:00', price: 3200 },
        { time: '12:00', price: 3250 },
        { time: '13:00', price: 3280 },
        { time: '14:00', price: 3220 },
        { time: '15:00', price: 3200 },
        { time: '16:00', price: 3200 },
    ]
  },
  {
    id: 'MON-102',
    hotelName: '北京宝格丽酒店',
    roomType: '高级城市景客房',
    checkIn: '2024-03-05',
    checkOut: '2024-03-07',
    targetPrice: 4500,
    currentPrice: 4200,
    hasInventory: true,
    status: 'REACHED',
    note: '已达标，建议尽快锁单',
    lastUpdated: '2分钟前',
    historyDaily: [
        { date: '01-20', open: 4800, close: 4750, high: 4850, low: 4700 },
        { date: '01-21', open: 4750, close: 4600, high: 4780, low: 4580 },
        { date: '01-22', open: 4600, close: 4500, high: 4650, low: 4480 },
        { date: '01-23', open: 4500, close: 4400, high: 4520, low: 4350 },
        { date: '01-24', open: 4400, close: 4200, high: 4450, low: 4180 },
    ],
    historyIntraday: [
        { time: '09:00', price: 4400 },
        { time: '10:00', price: 4350 },
        { time: '11:00', price: 4300 },
        { time: '12:00', price: 4200 },
        { time: '13:00', price: 4200 },
        { time: '14:00', price: 4200 },
    ]
  },
  {
    id: 'MON-103',
    hotelName: '三亚亚特兰蒂斯酒店',
    roomType: '海景大床房',
    checkIn: '2024-05-01',
    checkOut: '2024-05-03',
    targetPrice: 3500, 
    currentPrice: 0, 
    hasInventory: false,
    status: 'MONITORING',
    note: '五一热门房型，有房马上通知',
    lastUpdated: '1分钟前',
    historyDaily: [],
    historyIntraday: []
  },
  {
    id: 'MON-104',
    hotelName: '迪士尼乐园酒店',
    roomType: '奇幻童话城堡景观房',
    checkIn: '2024-04-15',
    checkOut: '2024-04-16',
    targetPrice: 6000, 
    currentPrice: 5888, 
    hasInventory: true,
    status: 'REACHED',
    note: '捡漏成功！目前库存紧张',
    lastUpdated: '刚刚',
    historyDaily: [],
    historyIntraday: []
  }
];

export const MOCK_SYSTEM_USERS: SystemUser[] = [
  {
    id: 'user-001',
    username: 'admin',
    name: '超级管理员',
    role: 'ADMIN',
    status: 'ACTIVE',
    permissions: {
      allowNewUserBooking: true,
      newUserLimit: -1,
      newUserQuota: -1, // Unlimited balance
      allowPlatinumBooking: true,
      platinumLimit: -1,
      platinumQuota: -1,
      allowCorporateBooking: true,
      corporateLimit: -1,
      corporateQuota: -1,
      allowedCorporateNames: [], // All
      corporateSpecificLimits: {},
      corporateSpecificQuotas: {}
    },
    lastLogin: '2024-02-15 10:30',
    createdAt: '2023-10-01'
  },
  {
    id: 'user-002',
    username: 'agent_alice',
    name: '张业务',
    role: 'USER',
    status: 'ACTIVE',
    permissions: {
      allowNewUserBooking: true,
      newUserLimit: 5,
      newUserQuota: 100, // Balance: 100
      allowPlatinumBooking: false,
      platinumLimit: 0,
      platinumQuota: 0,
      allowCorporateBooking: true,
      corporateLimit: 20,
      corporateQuota: 500, // Balance: 500
      allowedCorporateNames: ['阿里巴巴', '腾讯科技'],
      corporateSpecificLimits: {
          '阿里巴巴': 10,
          '腾讯科技': 5
      },
      corporateSpecificQuotas: {
          '阿里巴巴': 200,
          '腾讯科技': 100
      }
    },
    lastLogin: '2024-02-14 15:45',
    createdAt: '2023-11-20'
  },
  {
    id: 'user-003',
    username: 'intern_bob',
    name: '实习生小李',
    role: 'USER',
    status: 'ACTIVE',
    permissions: {
      allowNewUserBooking: true,
      newUserLimit: 1,
      newUserQuota: 10, // Balance: 10
      allowPlatinumBooking: false,
      platinumLimit: 0,
      platinumQuota: 0,
      allowCorporateBooking: false,
      corporateLimit: 0,
      corporateQuota: 0,
      allowedCorporateNames: [],
      corporateSpecificLimits: {},
      corporateSpecificQuotas: {}
    },
    lastLogin: '2024-02-15 09:00',
    createdAt: '2024-01-10'
  }
];

export const MOCK_SYSTEM_CONFIG: SystemConfig = {
  maintenanceMode: false,
  maintenanceMessage: "系统升级中，预计1小时后恢复。",
  channels: {
    enableNewUser: true,
    enablePlatinum: true,
    enableCorporate: true,
    disabledCorporateNames: ['某某科技 (风控中)', '旧协议单位']
  },
  proxies: [
    { id: 'p1', ip: '192.168.1.101', port: 8080, type: 'DYNAMIC', status: 'ONLINE', lastChecked: '1分钟前', location: '上海' },
    { id: 'p2', ip: '10.0.0.55', port: 3128, type: 'STATIC', status: 'ONLINE', lastChecked: '5分钟前', location: '北京' },
    { id: 'p3', ip: '47.100.22.33', port: 8888, type: 'DYNAMIC', status: 'OFFLINE', lastChecked: '1小时前', location: '广州' }
  ],
  llmModels: [
    { id: 'm1', name: 'Gemini Pro', provider: 'GEMINI', modelId: 'gemini-3-pro-preview', apiKey: 'sk-proj-****', systemPrompt: '你是一个专业的酒店预订助手，负责解析用户需求。', isActive: true },
    { id: 'm2', name: 'GPT-4 Turbo', provider: 'OPENAI', modelId: 'gpt-4-turbo', apiKey: 'sk-live-****', systemPrompt: '', isActive: false }
  ]
};
