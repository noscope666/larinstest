const express = require("express");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = 3000;

// Google Service Account JSON faylını avtomatik yükləyirik
const serviceAccountPath = path.join(__dirname, "bonus-cart-b5024b75d4f0.json");

if (!fs.existsSync(serviceAccountPath)) {
  console.error("❌ ERROR: Service Account JSON faylı tapılmadı!");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

const client = new google.auth.JWT(
  serviceAccount.client_email,
  null,
  serviceAccount.private_key,
  ["https://www.googleapis.com/auth/wallet_object.issuer"]
);

const wallet = google.walletobjects({ version: "v1", auth: client });

const ISSUER_ID = "3388000000022859545";
const CLASS_ID = `${ISSUER_ID}.weberia_bonus_loyalty`;

// 📌 Sinif məlumatlarını əldə et
async function getClassInfo() {
  try {
    const response = await wallet.loyaltyclass.get({ resourceId: CLASS_ID });
    console.log("📌 Mövcud Class məlumatları:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ ERROR: Class tapılmadı!", error.message);
    return null;
  }
}


// 📌 Müştəri üçün loyallıq kartı yarat
async function createLoyaltyObject(userId, userName, cardNumber, bonusBalance) {
  try {
    const objectId = `${ISSUER_ID}.${userId}`;
    const response = await wallet.loyaltyobject.insert({
      requestBody: {
        id: objectId,
        classId: CLASS_ID,
        state: "active",
        accountId: cardNumber,
        accountName: userName,
        barcode: { type: "CODE_128", value: cardNumber },
        loyaltyPoints: { balance: { string: `${bonusBalance} Bonus` } },
        hexBackgroundColor: "#0000FF",

        // 📌 ImageModuleData ilə şəkil əlavə edirik (Arxa fon üçün)
        imageModulesData: [
          {
            mainImage: {
              sourceUri: {
                uri: "https://i.ibb.co/vxty4cVb/loyality-card-clean-1.png" // Arxa fon şəkili
              },
              contentDescription: {
                defaultValue: {
                  language: "en-US",
                  value: "Background Image"
                }
              }
            },
            id: "IMAGE_MODULE_ID"
          }
        ],

        // 📌 Logo əlavə edirik
        logo: { sourceUri: { uri: "https://i.ibb.co/QjhJ1hBz/larins-logo-removebg-preview-2-1.png" } }
      }
    });

    console.log("✅ Yeni Kart Yaradıldı:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ ERROR Kart Yaratmaqda: ", error.message);
    return { error: error.message };
  }
}


// 📌 Müştəri üçün Google Wallet Link yarat
async function generateSaveToWalletLink(userId) {
  try {
    const objectId = `${ISSUER_ID}.${userId}`;
    const payload = {
      iss: serviceAccount.client_email,
      aud: "google",
      typ: "savetowallet",
      iat: Math.floor(Date.now() / 1000),
      payload: { loyaltyObjects: [{ id: objectId }] }
    };

    const token = jwt.sign(payload, serviceAccount.private_key, { algorithm: "RS256" });
    const saveUrl = `https://pay.google.com/gp/v/save/${token}`;

    console.log("✅ Google Wallet Link:", saveUrl);
    return saveUrl;
  } catch (error) {
    console.error("❌ ERROR Link Yaratmaqda: ", error.message);
    return { error: error.message };
  }
}

// 📌 Bonus balansını yenilə
async function updateLoyaltyObject(userId, newBonusBalance) {
  try {
    const objectId = `${ISSUER_ID}.${userId}`;
    const response = await wallet.loyaltyobject.patch({
      resourceId: objectId,
      requestBody: { loyaltyPoints: { balance: { string: `${newBonusBalance} Bonus` } } }
    });

    console.log("✅ Bonus Balansı Yeniləndi:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ ERROR Bonus Yeniləməkdə:", error.message);
    return { error: error.message };
  }
}

// 📌 Mövcud kartı sil
async function deleteLoyaltyObject(userId) {
  try {
    const objectId = `${ISSUER_ID}.${userId}`;
    const response = await wallet.loyaltyobject.delete({ resourceId: objectId });

    console.log("✅ Kart Silindi:", response.data);
    return { message: "Kart uğurla silindi!" };
  } catch (error) {
    console.error("❌ ERROR Kartı Silməkdə:", error.message);
    return { error: error.message };
  }
}

// 📌 API ENDPOINTS
app.get("/create-card", async (req, res) => {
  const { userId, userName, cardNumber, bonusBalance } = req.query;
  if (!userId || !userName || !cardNumber || !bonusBalance) {
    return res.json({ error: "Bütün parametrləri daxil et!" });
  }

  const newCard = await createLoyaltyObject(userId, userName, cardNumber, bonusBalance);
  if (!newCard.error) {
    const walletLink = await generateSaveToWalletLink(userId);
    res.json({ message: "Kart yaradıldı!", walletLink });
  } else {
    res.json({ error: newCard.error });
  }
});

app.get("/get-class-info", async (req, res) => {
  const result = await getClassInfo();
  res.json(result);
});

app.get("/update-bonus", async (req, res) => {
  const { userId, newBonusBalance } = req.query;
  if (!userId || !newBonusBalance) {
    return res.json({ error: "userId və newBonusBalance daxil edilməlidir!" });
  }

  const result = await updateLoyaltyObject(userId, newBonusBalance);
  res.json(result);
});

app.get("/get-wallet-token", async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.json({ error: "userId daxil edilməlidir!" });
  }

  const walletLink = await generateSaveToWalletLink(userId);
  res.json({ walletLink });
});

app.get("/delete-card", async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.json({ error: "userId daxil edilməlidir!" });
  }

  const result = await deleteLoyaltyObject(userId);
  res.json(result);
});

// 📌 SERVERİ BAŞLAT
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
