export enum SubscriptionPlanCode {
  PRO_MONTHLY = "PRO_MONTHLY",
  PRO_YEARLY = "PRO_YEARLY",
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
