import bcrypt from "bcryptjs";
import readline from "node:readline";
import { prisma } from "../config/database.js";

async function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

async function main() {
  console.log("\n========================================================");
  console.log("   🛡️  ZALO AUTO-REPLY SAAS - TẠO / NÂNG CẤP ADMIN");
  console.log("========================================================\n");

  const args = process.argv.slice(2);
  let email = args[0];
  let password = args[1];
  let name = args[2] || "Super Admin";

  if (!email) {
    email = await askQuestion("👉 Nhập Email Admin: ");
  }

  if (!email || !email.includes("@")) {
    console.error("❌ Lỗi: Email không hợp lệ!");
    process.exit(1);
  }

  if (!password) {
    password = await askQuestion("👉 Nhập Mật khẩu (tối thiểu 6 ký tự): ");
  }

  if (!password || password.length < 6) {
    console.error("❌ Lỗi: Mật khẩu phải có ít nhất 6 ký tự!");
    process.exit(1);
  }

  console.log(`\n⏳ Đang xử lý tài khoản [${email}]...`);

  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();
  const tenYearsLater = new Date(now.getTime() + 3650 * 24 * 60 * 60 * 1000);

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  let user;

  if (existingUser) {
    user = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        role: "ADMIN",
        passwordHash,
        name: name || existingUser.name,
        isBanned: false,
        banReason: null,
      },
    });
    console.log(`✨ Đã nâng cấp tài khoản hiện có thành ADMIN!`);
  } else {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: "ADMIN",
      },
    });
    console.log(`🎉 Đã tạo tài khoản mới thành công!`);
  }

  // Grant 10-year PRO_9 subscription with 99 bot capacity
  const existingSub = await prisma.subscription.findFirst({
    where: { userId: user.id },
    orderBy: { expiresAt: "desc" },
  });

  await prisma.subscription.upsert({
    where: { id: existingSub?.id || "non_existent_id" },
    create: {
      userId: user.id,
      planCode: "PRO_9",
      status: "ACTIVE",
      startsAt: now,
      expiresAt: tenYearsLater,
      maxBots: 99,
    },
    update: {
      planCode: "PRO_9",
      status: "ACTIVE",
      expiresAt: tenYearsLater,
      maxBots: 99,
    },
  });

  console.log("\n========================================================");
  console.log("✅ TÀI KHOẢN ADMIN ĐÃ SẴN SÀNG SỬ DỤNG 100%!");
  console.log("========================================================");
  console.log(`👤 Email:         ${user.email}`);
  console.log(`🔑 Quyền:         ADMIN (Toàn quyền quản trị)`);
  console.log(`💎 Gói thuê bao:  PRO_9 (Hạn đến ${tenYearsLater.toISOString().slice(0, 10)} - Tối đa 99 bot)`);
  console.log(`🌐 Đăng nhập tại: https://lvzalo.io.vn/ (hoặc http://localhost:3000)`);
  console.log("========================================================\n");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\n❌ Lỗi khi tạo tài khoản admin:", e);
  await prisma.$disconnect();
  process.exit(1);
});
