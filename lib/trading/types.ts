export type Side = "long" | "short";
export type MarginMode = "cross" | "isolated";
export type PositionMode = "one-way" | "hedge";
export type Tier = { lowerBound: string; maxLeverage: number };
export type Market = {
  coin: string;
  name: string;
  dex: string;
  maxLeverage: number;
  szDecimals: number;
  mark: string;
  mid: string;
  previous: string;
  volume: string;
  funding: string;
  openInterest: string;
  tiers: Tier[];
  isolatedOnly: boolean;
  disabled?: string;
};
export type Quote = {
  coin: string;
  mark: string;
  time: number;
  bids: [string, string][];
  asks: [string, string][];
};
export type Candle = {
  t: number;
  T: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
};
export type Funding = { coin: string; time: number; fundingRate: string };
export type Position = {
  id: string;
  coin: string;
  side: Side;
  quantity: string;
  entry: string;
  leverage: number;
  marginMode: MarginMode;
  margin: string;
  tp?: string;
  sl?: string;
  openedAt: number;
};
export type Order = {
  id: string;
  coin: string;
  side: Side;
  type: "market" | "limit";
  quantity: string;
  remaining: string;
  price?: string;
  leverage: number;
  marginMode: MarginMode;
  reduceOnly: boolean;
  tp?: string;
  sl?: string;
  reserved: string;
  status: "open" | "filled" | "cancelled";
  createdAt: number;
};
export type Fill = {
  id: string;
  orderId: string;
  coin: string;
  side: Side;
  quantity: string;
  price: string;
  fee: string;
  pnl: string;
  time: number;
  estimated: boolean;
  interval?: string;
  reason: string;
};
export type Entry = {
  id: string;
  time: number;
  type: "deposit" | "fee" | "realized" | "funding" | "adjustment";
  amount: string;
  coin?: string;
  reference: string;
  rate?: string;
  price?: string;
  estimated: boolean;
};
export type Snapshot = { time: number; equity: string };
export type TradingState = {
  id: string;
  createdAt: number;
  balance: string;
  positions: Position[];
  orders: Order[];
  fills: Fill[];
  ledger: Entry[];
  snapshots: Snapshot[];
  checkpoint: number;
  config: Record<string, { margin: MarginMode; position: PositionMode }>;
  marks: Record<string, string>;
  fundingThrough: Record<string, number>;
  replay?: { interval: string; estimated: true; through: number };
};
export type OrderInput = Pick<
  Order,
  | "coin"
  | "side"
  | "type"
  | "quantity"
  | "leverage"
  | "marginMode"
  | "reduceOnly"
  | "price"
  | "tp"
  | "sl"
>;
export type Execution = {
  time: number;
  estimated: boolean;
  interval?: string;
  reason: string;
};
