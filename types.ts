
export enum BookingType {
  CORPORATE = 'CORPORATE',
  PLATINUM = 'PLATINUM',
  NEW_USER = 'NEW_USER',
  NORMAL = 'NORMAL'
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE', // 在线/有效
  OFFLINE = 'OFFLINE', // 离线/Session过期
  RESTRICTED = 'RESTRICTED', // 风控/受限
  BLOCKED = 'BLOCKED' // 封禁
}

export enum AccountTier {
  NEW_USER = 'NEW_USER',       // 新用户
  NORMAL = 'NORMAL',           // 普通账号
  GOLD = 'GOLD',               // 金卡
  PLATINUM = 'PLATINUM',       // 白金
  CO_PLATINUM = 'CO_PLATINUM', // 联合白金
  CORPORATE = 'CORPORATE',     // 企业协议
  DIAMOND = 'DIAMOND'          // 钻石
}

export interface CouponWallet {
  breakfast: number;    // 早餐券
  lateCheckout: number; // 延迟退房券
  upgrade: number;      // 升房券
  slippers: number;     // 拖鞋券 (通常用于低价值凑数或特定权益)
}

export interface HotelAccount {
  id: string;
  phone: string;
  tier: AccountTier;
  corporateName?: string; // 企业名称 (仅限 CORPORATE 类型)
  points: number;
  coupons: CouponWallet;
  status: AccountStatus;
  dailyOrdersLeft: number;
  lastExecution: {
    checkIn?: string;  // 上次自动签到时间
    lottery?: string;  // 上次自动抽奖时间
    scan?: string;     // 上次优惠券扫描时间
  };
  // New field to store the text result of the last execution
  lastResult: {
    checkIn?: string;  // e.g. "签到成功 +50积分"
    lottery?: string;  // e.g. "未中奖"
    scan?: string;     // e.g. "扫描完成，发现 2 张新券"
  };
}

export interface PoolAccount extends HotelAccount {
  token?: string;
  token_configured?: boolean;
  is_online: boolean;
  remark?: string | null;
  is_platinum: boolean;
  is_corp_user: boolean;
  is_new_user: boolean;
  corporate_agreements: Array<{
    id: string;
    name: string;
    enabled: boolean;
  }>;
  breakfast_coupons: number;
  room_upgrade_coupons: number;
  late_checkout_coupons: number;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  hotelName: string;
  hotelAddress?: string; // Added for detail view
  roomType?: string;     // Added for detail view
  customerName: string;
  checkIn: string;
  checkOut: string;
  price: number;
  // Updated statuses to match user request: Wait Pay, Wait Stay, etc.
  status: 'UNPAID' | 'WAITING_CHECKIN' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'REFUNDING';
  type: BookingType;
  invoiceRequested: boolean;
  invoiceIssued: boolean;
  createdAt: string;
  tags?: string[]; // e.g. "Platinum Discount", "Free Breakfast"
  
  // New fields for User tracking
  creatorId: string;   // ID of the system user (agent) who created the order
  creatorName: string; // Name of the system user
}

export interface OrderSplitItem {
  id: string;
  groupId: string;
  atourOrderId?: string | null;
  roomType: string;
  roomCount: number;
  accountId?: string | null;
  accountPhone?: string | null;
  checkInDate: string;
  checkOutDate: string;
  amount: number;
  status: string;
  paymentStatus: string;
  executionStatus: string;
  paymentLink?: string | null;
  detailUrl?: string | null;
  splitIndex: number;
  splitTotal: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderGroup {
  id: string;
  bizOrderNo: string;
  chainId: string;
  hotelName: string;
  customerName: string;
  contactPhone?: string | null;
  checkInDate: string;
  checkOutDate: string;
  totalNights: number;
  totalAmount: number;
  currency: string;
  status: string;
  paymentStatus: string;
  creatorId: string;
  creatorName: string;
  remark?: string | null;
  splitCount: number;
  createdAt: string;
  updatedAt: string;
  items: OrderSplitItem[];
}

export interface PriceAlert {
  id: string;
  hotelName: string;
  targetPrice: number;
  currentPrice: number;
  date: string;
}

export interface AIQuoteRequest {
  rawText: string;
}

export interface AIQuoteResponse {
  hotelName: string;
  location?: string;
  dates: string;
  roomType: string;
  estimatedPrice: string;
  recommendation: string;
  breakfast?: string;
  cancellationPolicy?: string;
  otherInfo?: string;
}

export interface QuoteTask {
  id: string;
  type: 'TEXT' | 'IMAGE';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  inputText?: string;
  inputImage?: string; // base64
  customInstructions?: string;
  template?: string;
  result?: AIQuoteResponse;
  createdAt: string;
  error?: string;
}

// --- NEW TYPES FOR BOOKING FLOW ---

export interface RatePlan {
  id: string;
  name: string; // e.g. "白金会员专享价", "企业协议价"
  price: number;
  originalPrice?: number;
  type: BookingType;
  tags: string[]; // e.g. ["含双早", "免费取消"]
  stock?: number;
  description?: string;
  cancelTips?: string;
  bookNotice?: string;
  rewardPointText?: string;
  breakfastCount?: number;
  discountTexts?: string[];
}

export interface Room {
  id: string;
  name: string; // e.g. "高级大床房"
  image: string;
  size: string; // e.g. "25m²"
  bed: string; // e.g. "1.8m大床"
  window: string; // e.g. "有窗"
  tags: string[]; // e.g. ["深睡枕", "智能客控"]
  stock?: number;
  rates: RatePlan[];
}

export interface Hotel {
  id: string;
  chainId?: string;
  name: string;
  location: string;
  address: string;
  score: number;
  reviews: number;
  image: string;
  tags: string[]; // e.g. ["外宾适用", "免费停车"]
  minPrice: number;
  rooms: Room[];
  blacklistCount?: number; // How many agents marked this as bad
}

// --- PRICE MONITOR TYPES ---

export interface PriceMonitorTask {
  id: string;
  hotelName: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  
  // Monitoring Logic
  targetPrice: number; 
  
  // Current State
  currentPrice: number;
  hasInventory: boolean; // 是否有房
  
  status: 'MONITORING' | 'REACHED' | 'PAUSED';
  note: string;
  
  // Chart Data
  historyDaily: DailyCandle[]; // 日K
  historyIntraday: PricePoint[]; // 分时
  lastUpdated: string;
}

export interface PricePoint {
  time: string; // timestamp or label
  price: number;
}

export interface DailyCandle {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
}

// --- BLACKLIST TYPES ---

export interface BlacklistRecord {
  id: string;
  chainId: string;
  hotelName: string;
  reason: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW'; // HIGH: 严重避雷(诈骗/安全), MEDIUM: 体验差, LOW: 吐槽
  tags: string[]; // e.g. "卫生差", "乱收费", "态度恶劣"
  reportedBy: string; // Agent Name/ID
  date: string;
  status?: 'ACTIVE' | 'RESOLVED';
  source?: string;
}

// --- SYSTEM USER TYPES (User Management) ---

export interface UserPermissions {
  // New User Pool
  allowNewUserBooking: boolean;   
  newUserLimit: number;           // 每日限额 (-1 为无限制)
  newUserQuota: number;           // 总配额/余额 (-1 为无限制)
  
  // Platinum Pool
  allowPlatinumBooking: boolean;  
  platinumLimit: number;          // 每日限额 (-1 为无限制)
  platinumQuota: number;          // 总配额/余额 (-1 为无限制)

  // Corporate Pool
  allowCorporateBooking: boolean; 
  corporateLimit: number;         // 每日总限额 (-1 为无限制)
  corporateQuota: number;         // 总配额/余额 (-1 为无限制)
  
  allowedCorporateNames: string[]; // 允许使用的具体企业协议名称
  corporateSpecificLimits: Record<string, number>; // 针对具体企业的每日限额
  corporateSpecificQuotas: Record<string, number>; // 针对具体企业的总配额
}

export interface SystemUser {
  id: string;
  username: string;
  name: string;
  role: 'ADMIN' | 'USER';
  status: 'ACTIVE' | 'DISABLED' | 'PENDING';
  permissions: UserPermissions;
  lastLogin?: string;
  createdAt: string;
}

// --- SYSTEM SETTINGS TYPES ---

export interface ProxyNode {
  id: string;
  ip: string;
  port: number;
  type: 'DYNAMIC' | 'STATIC';
  status: 'ONLINE' | 'OFFLINE' | 'LATENCY';
  lastChecked: string;
  location?: string;
  failCount?: number;
}

export interface LLMConfig {
  id: string;
  name: string;
  provider: 'GEMINI' | 'OPENAI' | 'CLAUDE';
  modelId: string;
  apiKey: string;
  systemPrompt: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  isActive: boolean;
}

export interface SystemConfig {
  siteName: string;
  supportContact: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  
  // Global Channel Switches (Overrides user permissions)
  channels: {
    enableNewUser: boolean;
    enablePlatinum: boolean;
    enableCorporate: boolean;
    disabledCorporateNames: string[]; // Specific companies to ban globally
  };

  proxies: ProxyNode[];
  llmModels: LLMConfig[];
}
