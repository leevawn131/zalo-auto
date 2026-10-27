export enum SubscriptionPlanCode {
  STARTER_2 = "STARTER_2",
  STANDARD_5 = "STANDARD_5",
  PRO_9 = "PRO_9",
}

export interface PlanDetail {
  code: SubscriptionPlanCode;
  name: string;
  price: number; // VND
  durationDays: number;
  maxBots: number;
  description: string;
}

export interface SePayWebhookPayload {
  id: number;
  gateway: string;
  transactionDate: string;
  accountNumber: string;
  subAccount?: string | null;
  code?: string | null;
  content: string; // payment message containing paymentCode, e.g. "INV123456"
  transferType: "in" | "out";
  description?: string;
  amountIn: number;
  amountOut: number;
  accumulated: number;
  referenceCode: string;
}

export interface InvoiceCreationResult {
  transactionId: string;
  paymentCode: string;
  amount: number;
  qrCodeUrl: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}
