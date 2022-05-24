const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { MongoClient } = require("mongodb");
const ObjectId = require("mongodb").ObjectId;
require("dotenv").config();
const bcrypt = require("bcrypt");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload());

const serviceAccount = {
  type: process.env.FIREBASE_SERVICE_ACCOUNT_TYPE,
  project_id: process.env.FIREBASE_SERVICE_ACCOUNT_PROJECT_ID,
  private_key_id: process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(
    /\\n/g,
    "\n"
  ),
  client_email: process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_ID,
  auth_uri: process.env.FIREBASE_SERVICE_ACCOUNT_AUTH_URI,
  token_uri: process.env.FIREBASE_SERVICE_ACCOUNT_TOKEN_URI,
  auth_provider_x509_cert_url:
    process.env.FIREBASE_SERVICE_ACCOUNT_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url:
    process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_X509_CERT_URL,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Db connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lcafd.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// token verification
async function verifyToken(req, res, next) {
  if (req.headers.authorization?.startsWith("Bearer ")) {
    const token = req.headers.authorization.split(" ")[1];
    try {
      const decodedUser = await admin.auth().verifyIdToken(token);
      req.decodedEmail = decodedUser.email;
    } catch {}
  }
  next();
}

async function run() {
  try {
    await client.connect();

    // database
    const database = client.db("doctorsPortal");

    //collection
    const usersCollection = database.collection("users");
    const radioStationCollection = database.collection("radioStation");

    // users login
    app.get("/login", async (req, res) => {
      const user = await usersCollection.findOne({ email: req.body.email });

      const validUser = await bcrypt.compare(req.body.password, user.password);
      if (!validUser) return res.status(400).send("Invalid Email or Password!");

      const token = user.generateJWT();
      res.send({
        token: token,
        user: _.pick(user, ["_id", "email"]),
      });
    });

    // user registration
    app.post("/register/", async (req, res) => {
      let user = await usersCollection.findOne({ email: req.body.email });
      if (user) return res.status(400).send("User already registerd!");

      user = new User(req.body, ["email", "password"]);

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(user.password, salt);
      const token = user.generateJWT();

      const result = await user.save();
      const result = await usersCollection.insertOne(user);

      return res.status(201).send({
        token: token,
        user: {result, ["_id", "email"]},
      });
    });

    // stations
    app.get("/radioStations", async function (req, res) {
      const cursor = radioStationCollection.find({});
      const stations = await cursor.toArray();
      res.json(stations);
    });

    // appointment post api
    app.post("/radioStation", verifyToken, async function (req, res) {
      const station = req.body;
      // console.log(appointment);
      const result = await radioStationCollection.insertOne(station);
      res.json(result);
    });

    app.put("/radioStations", async (req, res) => {
      const station = req.body;
      const filter = { id: station.id };
      const option = { upsert: true };
      const updateDoc = { $set: station };
      const result = await radioStationCollection.updateOne(
        filter,
        updateDoc,
        option
      );
      res.json(result);
    });
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("Hello DoctorsPortal!"));
app.listen(port, () =>
  console.log(`DoctorsPortal app listening on port ${port}!`)
);
