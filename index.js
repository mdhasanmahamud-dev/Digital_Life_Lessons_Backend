require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KYE);
const admin = require("firebase-admin");
const port = process.env.PORT || 5000;

// const serviceAccount = require("./digital-life-lessons.json");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
// middleware
app.use(
  cors({
    origin: [
      process.env.CLIENT_DOMAIN,
      "https://digital-life-lessons-638c6.web.app",
      "http://localhost:5173",
      "http://localhost:5174",
    ],

    credentials: true,
    optionSuccessStatus: 200,
  })
);
app.use(express.json());

// jwt middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
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
    const lessonsReportsCollection = db.collection("reportsCollection");

    //_________________________________________________LESSONS RELATED APIS HERE___________________________________________________________//

    //........................Save a lesson data in db.................................//
    app.post("/lessons", async (req, res) => {
      const lessonData = req.body;
      try {
        const lesson = {
          ...lessonData,
          isFeatured: false,
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
    app.get("/all-lessons", verifyJWT, async (req, res) => {
      try {
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

    //........................Get All public lesson data from db........................//
    app.get("/lessons", async (req, res) => {
      try {
        const query = { privacy: "public" };
        const lessons = await lessonCollection.find(query).toArray();
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

    //.............................Get most saved lessons from db.........................//
    app.get("/lessons/most-saved", async (req, res) => {
      try {
        const result = await favoriteCollection
          .aggregate([
            {
              $group: {
                _id: "$lessonId",
                totalSaved: { $sum: 1 },
              },
            },
            { $sort: { totalSaved: -1 } },
            { $limit: 6 },
            {
              $lookup: {
                from: "lessonCollection",
                localField: "_id",
                foreignField: "_id",
                as: "lesson",
              },
            },
            { $unwind: "$lesson" },
            {
              $match: {
                "lesson.privacy": "public",
              },
            },
          ])
          .toArray();

        res.send({ success: true, lessons: result });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Could not load most saved lessons",
        });
      }
    });

    //........................Get all lessons by email from db..........................//
    app.get("/lessons/user/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const query = { "creator.email": email };
        const lessons = await lessonCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();
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

    //......................Counts all public lesson  from db...........................//
    app.get("/lessons/public/total-count", verifyJWT, async (req, res) => {
      try {
        const query = { privacy: "public" };
        const count = await lessonCollection.countDocuments(query);
        res.status(200).json({
          success: true,
          message: "All public lessons count successfull..",
          count,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch public lessons count",
          error: error.message,
        });
      }
    });

    //......................Counts all private lesson  from db...........................//
    app.get("/lessons/private/total-count", verifyJWT, async (req, res) => {
      try {
        const query = { privacy: "private" };
        const count = await lessonCollection.countDocuments(query);
        res.status(200).json({
          success: true,
          message: "All public lessons count successfull..",
          count,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch public lessons count",
          error: error.message,
        });
      }
    });

    //...................... Counts today created lessons from db .......................//
    app.get("/lessons/analytics/today-count", verifyJWT, async (req, res) => {
      try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        const count = await lessonCollection.countDocuments({
          createdAt: {
            $gte: startOfToday,
            $lte: endOfToday,
          },
        });

        res.status(200).json({
          success: true,
          count,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
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

    //.........................Get featured lesson from db................................//
    app.get("/lessons/featured", async (req, res) => {
      try {
        const query = { isFeatured: true };
        const featured = await lessonCollection.find(query).toArray();

        res.status(200).json({
          status: true,
          data: featured,
        });
      } catch (error) {
        res.status(500).json({
          status: false,
          message: "Failed to fetch featured lessons",
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
        console.log("Failed to fetch single lesson..");
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

    //......................Counts user favorites by email from db.........................//
    app.get("/favorites/count/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const count = await favoriteCollection.countDocuments({
          userEmail: email,
        });
        res.status(200).json({
          success: true,
          count,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Failed to fetch favorites count",
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

    //......................Get recent lesson by email from db.............................//
    app.get("/lessons/recent/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const recentLessons = await lessonCollection
          .find({ "creator.email": email })
          .sort({ createdAt: -1 })
          .limit(4)
          .toArray();

        res.status(200).json({
          success: true,
          recentLessons,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Failed to fetch recent lessons",
          error: error.message,
        });
      }
    });

    //...................... Count active contributors from db ...........................//
    app.get(
      "/lessons/analytics/active-contributors",
      verifyJWT,
      async (req, res) => {
        try {
          const contributors = await lessonCollection
            .aggregate([
              {
                $group: {
                  _id: "$creator.email",
                },
              },
              {
                $count: "totalActiveContributors",
              },
            ])
            .toArray();

          const count =
            contributors.length > 0
              ? contributors[0].totalActiveContributors
              : 0;

          res.status(200).json({
            success: true,
            count,
          });
        } catch (error) {
          res.status(500).json({
            success: false,
            message: "Failed to fetch active contributors",
            error: error.message,
          });
        }
      }
    );

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

    //...................... Update a lesson visibility by ID in db.......................//
    app.put("/lessons/visibility/:id", verifyJWT, async (req, res) => {
      const { id } = req.params;
      const { privacy } = req.body;
      try {
        const query = { _id: new ObjectId(id) };
        const updatedDoc = { $set: { privacy: privacy } };
        const result = await lessonCollection.updateOne(query, updatedDoc);

        if (result.modifiedCount > 0) {
          return res.send({
            success: true,
            message: "Visibility updated successfully",
          });
        } else {
          return res.send({
            success: false,
            message: "Failed to update visibility",
          });
        }
      } catch (error) {
        return res
          .status(500)
          .send({ success: false, message: "Server Error" });
      }
    });

    //...................... Update a lesson access lavel by ID in db.....................//
    app.put("/lessons/access/:id", verifyJWT, async (req, res) => {
      const { id } = req.params;
      const { accessLevel } = req.body;
      try {
        const query = { _id: new ObjectId(id) };
        const updatedDoc = { $set: { accessLevel: accessLevel } };
        const result = await lessonCollection.updateOne(query, updatedDoc);

        if (result.modifiedCount > 0) {
          return res.send({
            success: true,
            message: "AccessLevel updated successfully",
          });
        } else {
          return res.send({
            success: false,
            message: "Failed to update accessLevel",
          });
        }
      } catch (error) {
        return res
          .status(500)
          .send({ success: false, message: "Server Error" });
      }
    });

    //...................... Update a lesson featured level by ID in db....................//
    app.put("/lessons/featured/:id", verifyJWT, async (req, res) => {
      const { id } = req.params;
      const { featured } = req.body;

      try {
        const query = { _id: new ObjectId(id) };
        const updatedDoc = { $set: { isFeatured: featured } };
        const result = await lessonCollection.updateOne(query, updatedDoc);

        if (result.modifiedCount > 0) {
          return res.send({
            success: true,
            message: "Featured updated successfully",
          });
        } else {
          return res.send({
            success: false,
            message: "Failed to update featured",
          });
        }
      } catch (error) {
        console.error("Error updating featured:", error);
        return res.status(500).send({
          success: false,
          message: "Internal server error",
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
        res.status(200).json({
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

    //...................... Get favorites by user email.................................//
    app.get("/favorites", async (req, res) => {
      const { email } = req.query;

      try {
        const favorites = await favoriteCollection
          .aggregate([
            {
              $match: { userEmail: email },
            },
            {
              $lookup: {
                from: "lessonCollection",
                localField: "lessonId",
                foreignField: "_id",
                as: "lesson",
              },
            },
            {
              $unwind: "$lesson",
            },
            {
              $project: {
                userEmail: 1,
                savedAt: 1,
                "lesson._id": 1,
                "lesson.title": 1,
                "lesson.category": 1,
              },
            },
          ])
          .toArray();

        res.status(200).json({
          success: true,
          favorites,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Failed to fetch favorites",
        });
      }
    });

    //.................... Get top active contributors with lesson count .................//
    app.get(
      "/lessons/analytics/top-contributors",
      verifyJWT,
      async (req, res) => {
        try {
          const contributors = await lessonCollection
            .aggregate([
              {
                $group: {
                  _id: "$creator.email",
                  name: { $first: "$creator.name" },
                  totalLessons: { $sum: 1 },
                },
              },
              { $sort: { totalLessons: -1 } },
              { $limit: 5 },
            ])
            .toArray();

          res.status(200).json({
            success: true,
            contributors,
          });
        } catch (error) {
          res.status(500).json({
            success: false,
            message: "Failed to fetch active contributors",
          });
        }
      }
    );

    //...................... Remove a  favorite lesson by id from db......................//
    app.delete("/favorites/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const query = { _id: new ObjectId(id) };
        const result = await favoriteCollection.deleteOne(query);
        if (result.deletedCount === 1) {
          res.status(200).json({
            success: true,
            message: "Favorite lesson removed successfully",
          });
        } else {
          res.status(404).json({
            success: false,
            message: "Favorite lesson not found",
          });
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Internal server error",
          error: error.message,
        });
      }
    });

    //_________________________________________________REPORTS RELATED APIS HERE___________________________________________________________//

    //....................................Save a report in db.............................//
    app.post("/reportes", async (req, res) => {
      try {
        const reportData = req.body;
        const {
          lessonId,
          reporterUserId,
          reportedUserEmail,
          reason,
          description,
        } = reportData;

        if (
          !lessonId ||
          !reporterUserId ||
          !reportedUserEmail ||
          !reason ||
          !description
        ) {
          return res.status(400).json({
            success: false,
            message: "Required fields are missing",
          });
        }

        // Create report object
        const newReport = {
          lessonId,
          reporterUserId,
          reportedUserEmail,
          reason,
          description,
          timestamp: new Date(),
        };

        const result = await lessonsReportsCollection.insertOne(newReport);

        res.status(201).json({
          success: true,
          message: "Report submitted successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Report submit error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to submit report",
        });
      }
    });

    //.................................Get all reports from db...........................//
    app.get("/reportes", async (req, res) => {
      try {
        const reportsCount = await lessonsReportsCollection
          .aggregate([
            {
              $addFields: {
                lessonIdObj: { $toObjectId: "$lessonId" },
              },
            },
            {
              $group: {
                _id: "$lessonIdObj",
                count: { $sum: 1 },
              },
            },
            {
              $lookup: {
                from: "lessonCollection",
                localField: "_id",
                foreignField: "_id",
                as: "lesson",
              },
            },
            { $unwind: "$lesson" },
            {
              $project: {
                _id: 0,
                lessonId: "$_id",
                lessonTitle: "$lesson.title",
                reportCount: "$count",
              },
            },
          ])
          .toArray();

        res.status(200).json({
          success: true,
          data: reportsCount,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch report counts",
        });
      }
    });

    //..........................Counts report lesson by .................................//
    app.get("/reportes/count", async (req, res) => {
      try {
        const count = await lessonsReportsCollection.countDocuments();
        res.status(200).json({
          success: true,
          count,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch report count",
          error: error.message,
        });
      }
    });

    //___________________________________________________USERS RELATED APIS HERE_____________________________________________________________//
    //........................Save a user data in db....................................//
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

    //........................Get all users data from in db.............................//
    app.get("/user", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.status(200).json({
          success: true,
          message: "All users fetched successfully",
          users: users,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Failed to fetch users",
          error: error.message,
        });
      }
    });

    //......................Counts user lesson by email from db............................//
    app.get("/user/count", async (req, res) => {
      try {
        const count = await usersCollection.countDocuments();
        res.status(200).json({
          success: true,
          message: "All users count successfull..",
          count,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch users count",
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

    //........................get user role by email from db..............................//
    app.get("/user/role/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const query = { email: email };
        const user = await usersCollection.findOne(query, {
          projection: { role: 1, _id: 0 },
        });

        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        res.status(200).json({
          success: true,
          message: "User role retrieved successfully",
          role: user.role,
        });
      } catch (error) {
        console.error("Error retrieving user role:", error);
        res.status(500).json({
          success: false,
          message: "Failed to retrieve user role",
          error: error.message,
        });
      }
    });

    //.........................Update user role in db.....................................//
    app.patch("/user/role/:id", async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;

      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: role } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "User not found or role already set",
          });
        }

        res.status(200).json({
          success: true,
          message: "User role updated successfully",
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Failed to update role",
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
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
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
