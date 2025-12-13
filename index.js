require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KYE);
const admin = require("firebase-admin");
const port = process.env.PORT || 5000;
// const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
//   "utf-8"
// );
// const serviceAccount = JSON.parse(decoded);
const serviceAccount = require("./digital-life-lessons.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
// middleware
app.use(
  cors({
    origin: [process.env.CLIENT_DOMAIN],
    credentials: true,
    optionSuccessStatus: 200,
  })
);
app.use(express.json());

// jwt middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  console.log(token);
  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    console.log(decoded);
    next();
  } catch (err) {
    console.log(err);
    return res.status(401).send({ message: "Unauthorized Access!", err });
  }
};

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    const db = client.db("DigitalLifeLessonsDB");

    //Create Collections
    const usersCollection = db.collection("users");
    const lessonCollection = db.collection("lessonCollection");
    const favoriteCollection = db.collection("favoriteCollection");

    //_________________________________________________LESSONS RELATED APIS HERE___________________________________________________________//

    //........................Save a lesson data in db.................................//
    app.post("/lessons", async (req, res) => {
      const lessonData = req.body;
      try {
        const lesson = {
          ...lessonData,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        const result = await lessonCollection.insertOne(lesson);
        res.status(200).json({
          success: true,
          message: "Lesson data inserted successfully",
          result,
        });
      } catch (error) {
        console.error("Error inserting lesson data:", error);
        res.status(500).json({
          success: false,
          message: "Failed to insert lesson data",
          error: error.message,
        });
      }
    });

    //........................Get All lesson data from db...............................//
    app.get("/lessons", async (req, res) => {
      try {
        const query = { privacy: "public" };
        const lessons = await lessonCollection.find().toArray();
        res.status(200).json({
          success: true,
          message: "Lessons data retrieved successfully",
          lessons,
        });
      } catch (error) {
        console.error("Error retrieving lessons data:", error);
        res.status(500).json({
          success: false,
          message: "Failed to retrieve lessons data",
          error: error.message,
        });
      }
    });

    //........................Get all lessons by email from db...........................//
    app.get("/lessons/user/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const query = { "creator.email": email };
        const lessons = await lessonCollection.find(query).toArray();
        res.status(200).json({
          success: true,
          message: "Lesson data retrieved successfully",
          lessons,
        });
      } catch (error) {
        console.error("Error retrieving lesson data:", error);
        res.status(500).json({
          success: false,
          message: "Failed to retrieve lesson data",
          error: error.message,
        });
      }
    });

    //........................Get all public lessons by email from db....................//
    app.get("/lessons/public/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const query = { "creator.email": email };
        const projection = { title: 1, description: 1, category: 1 };
        const lessons = await lessonCollection
          .find(query)
          .project(projection)
          .sort({ createdAt: -1 })
          .toArray();

        // Public lession not found
        if (!lessons.length) {
          return res.status(404).json({
            success: false,
            message: "No public lessons found for this user",
            lessons: [],
          });
        }
        // success response
        res.status(200).json({
          success: true,
          message: "Public lessons retrieved successfully",
          lessons,
        });
      } catch (error) {
        console.error("Error retrieving lesson data:", error);
        res.status(500).json({
          success: false,
          message: "Failed to retrieve public lesson data",
          error: error.message,
        });
      }
    });

    //...................... Get a lesson by ID from db..................................//
    app.get("/lessons/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const query = { _id: new ObjectId(id) };
        const lesson = await lessonCollection.findOne(query);
        if (!lesson) {
          return res.status(404).json({
            status: false,
            message: "Lesson Not Found",
          });
        }
        res.status(200).json({
          status: true,
          message: "Lesson fetched successfully",
          lesson,
        });
      } catch (error) {
        console.log("Failed to fetch single lesson");
        res.status(200).json({
          status: false,
          message: "Failed to fetch single lesson!",
        });
      }
    });

    //......................Counts user lesson by email from db............................//
    app.get("/lessons/count/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const count = await lessonCollection.countDocuments({
          "creator.email": email,
        });
        res.status(200).json({
          success: true,
          count,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch lessons count",
          error: error.message,
        });
      }
    });

    //................Get recommended lesson by category and tone from db..................//
    app.get("/lessons/recommended/:id", async (req, res) => {
      const { id } = req.params;
      try {
        //.......................Current lesson fetch.......................//
        const currentLesson = await lessonCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!currentLesson) {
          return res
            .status(404)
            .json({ success: false, message: "Lesson not found" });
        }

        //....................... Filter for recommended lessons.......................//
        const query = {
          _id: { $ne: currentLesson._id },
          $or: [
            { category: currentLesson.category },
            { emotionalTone: currentLesson.emotionalTone },
          ],
          privacy: "public",
        };

        const recommendedLessons = await lessonCollection
          .find(query)
          .limit(6)
          .toArray();

        res.status(200).json({
          success: true,
          message: "RecommendedLessons Fetch Successfull",
          lessons: recommendedLessons,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch recommended lessons",
          error: error.message,
        });
      }
    });

    //...................... DELETE a lesson by ID from db.................................//
    app.delete("/lessons/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const query = { _id: new ObjectId(id) };
        const result = await lessonCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Lesson not found",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Lesson deleted successfully",
        });
      } catch (error) {
        console.error("Delete error:", error);

        return res.status(500).json({
          success: false,
          message: "Internal server error while deleting lesson",
          error: error.message,
        });
      }
    });

    //...................... Update a lesson by ID in db..................................//
    app.patch("/lessons/:id", async (req, res) => {
      const { id } = req.params;
      const updatedData = req.body;
      try {
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: updatedData,
        };

        const result = await lessonCollection.updateOne(query, updateDoc);

        if (result.modifiedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "No changes found or lesson not found!",
          });
        }

        res.status(200).json({
          success: true,
          message: "Lesson updated successfully",
        });
      } catch (error) {
        console.error("Failed to update lesson:", error);
        res.status(500).json({
          success: false,
          message: "Failed to update lesson",
          error: error.message,
        });
      }
    });

    //_________________________________________________FAVORITES RELATED APIS HERE___________________________________________________________//

    //...................... Add Lesson to Favorites......................................//
    app.post("/favorites", async (req, res) => {
      const { lessonId, userEmail } = req.body;
      try {
        const exists = await favoriteCollection.findOne({
          userEmail,
          lessonId: new ObjectId(lessonId),
        });

        if (exists) {
          return res.status(400).json({
            success: false,
            message: "Lesson already in favorites",
          });
        }

        const favorite = {
          userEmail,
          lessonId: new ObjectId(lessonId),
          savedAt: new Date(),
        };

        const result = await favoriteCollection.insertOne(favorite);
        res
          .status(200)
          .json({
            success: true,
            message: "Lesson added to favorites",
            result,
          });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          success: false,
          message: "Failed to add favorite",
          error: error.message,
        });
      }
    });

    //___________________________________________________USERS RELATED APIS HERE_____________________________________________________________//

    //........................Save a lesson data in db....................................//
    app.post("/user", async (req, res) => {
      const userData = req.body;
      try {
        userData.created_at = new Date().toISOString();
        userData.last_loggedIn = new Date().toISOString();
        userData.role = "user";
        userData.isPremium = false;

        const query = {
          email: userData.email,
        };

        const alreadyExists = await usersCollection.findOne(query);

        if (alreadyExists) {
          console.log("Updating user info......");
          const result = await usersCollection.updateOne(query, {
            $set: {
              last_loggedIn: new Date().toISOString(),
            },
          });
          return res.send(result);
        }

        console.log("Saving new user info......");
        const result = await usersCollection.insertOne(userData);
        res.status(200).json({
          success: true,
          message: "User data inserted successfully",
          result,
        });
      } catch (error) {
        console.error("Error inserting user data:", error);
        res.status(500).json({
          success: false,
          message: "Failed to insert user data",
          error: error.message,
        });
      }
    });

    //........................get user by email from db...................................//
    app.get("/user/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const query = { email: email };
        const user = await usersCollection.findOne(query);
        res.status(200).json({
          success: true,
          message: "User data retrieved successfully",
          user,
        });
      } catch (error) {
        console.error("Error retrieving user data:", error);
        res.status(500).json({
          success: false,
          message: "Failed to retrieve user data",
          error: error.message,
        });
      }
    });

    //___________________________________________________PAYMENT RELATED APIS HERE_____________________________________________________________//
    //........................Create Stripe Checkout Session..........................//
    app.post("/create-checkout-session", async (req, res) => {
      const { email, name, photo, uid, price } = req.body;
      console.log(price);
      try {
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          customer_email: email,
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: "Premium Membership",
                },
                unit_amount: price * 100,
              },
              quantity: 1,
            },
          ],
          metadata: {
            name: name,
            photo: photo,
            uid: uid,
          },
          success_url: `${process.env.CLIENT_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.CLIENT_DOMAIN}/upgrade`,
        });

        res.status(200).json({
          success: true,
          message: "Checkout session created successfully.",
          url: session.url,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Failed to create checkout session. Please try again later.",
          error: error.message,
        });
      }
    });

    //..................Verify and update user status by email in db...................//
    app.get("/verify-payment/:sessionId", async (req, res) => {
      const { sessionId } = req.params;
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        console.log(session);
        if (session.payment_status === "paid") {
          // update user isPremium true
          await usersCollection.updateOne(
            { email: session.customer_email },
            { $set: { isPremium: true } }
          );
          res.send({ success: true });
        } else {
          res.send({ success: false });
        }
      } catch (err) {
        console.log(err);
        res.status(500).send({ success: false, error: err.message });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from Server..");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
