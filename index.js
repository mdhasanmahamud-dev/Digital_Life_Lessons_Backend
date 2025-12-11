require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://b12-m11-session.web.app",
    ],
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

    //____________________________________________________________LESSONS RELATED APIS HERE___________________________________________________________//

    //........................Save a lesson data in db.................................//
    app.post("/lessons", async (req, res) => {
      const lessonData = req.body;
      try {
        console.log(lessonData); // Correct variable name
        const result = await lessonCollection.insertOne(lessonData);
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

    //........................Get lessons by email from db..............................//
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

    //...................... DELETE a lesson by ID from db...............................//
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

    //...................... Update a lesson by ID from db...............................//
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

    
    //______________________________________________________________USERS T RELATED APIS HER_____________________________________________________________//

    //........................Save a lesson data in db.................................//
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

    //........................get user by email from db.................................//
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

    //______________________________________________________________PAYMENT RELATED APIS HER_____________________________________________________________//

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
