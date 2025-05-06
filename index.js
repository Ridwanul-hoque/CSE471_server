const express = require('express');
const app = express()
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken')
require('dotenv').config()
const cors = require('cors')
const port = process.env.PORT || 5000;
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// ✅ Multer Setup for file uploads (images)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8gt7g.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const usersCollection = client.db("PawkieDB").collection("users")
    const animalCollection = client.db("PawkieDB").collection("animal")
    const petsCollection = client.db("PawkieDB").collection("pets");
    const prescriptionsCollection = client.db("PawkieDB").collection("prescriptions");
    const queueCollection = client.db("PawkieDB").collection("doctorQueue");
    const missingPostsCollection = client.db("PawkieDB").collection("missingPosts");
    const rescuePostsCollection = client.db("PawkieDB").collection("rescuePosts");
    const productsCollection = client.db("PawkieDB").collection("products");
    const ordersCollection = client.db("PawkieDB").collection("orders");
    const paymentsCollection = client.db("PawkieDB").collection("payments");
    const adoptedPets = client.db("PawkieDB").collection("adoptedPets")
    const doctorCollection = client.db("PawkieDB").collection("doctors")

    // jwt
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h'
      });
      res.send({ token })

    })

    // middlewares
    const verifyToken = ((req, res, next) => {
      console.log('inside verify headers', req.headers);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'forbidden access' })
      }
      const token = req.headers.authorization.split(' ')[1]
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
          return res.status(401).send({ message: 'forbidden access' })

        }
        req.decoded = decoded
        next()
      })
    })
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === 'admin'
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next()
    }

    const verifyDoctor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isDoctor = user?.role === 'doctor';
      if (!isDoctor) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    };




    // users

    app.get('/users', async (req, res) => {
      console.log(req.headers)
      const result = await usersCollection.find().toArray();
      res.send(result)
    });


    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'unauthorized access' })
      }
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';

      }
      res.send({ admin })

    })
    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await usersCollection.updateOne(filter, updatedDoc)
      res.send(result)
    })
    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await usersCollection.deleteOne(query);
      res.send(result)
    })
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await usersCollection.findOne(query)
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null })
      }
      const result = await usersCollection.insertOne(user);
      res.send(result)
    })
    // Zayed's Part - Get user by email
    app.get('/users/:email', async (req, res) => {
      const email = req.params.email;
      try {
        const query = { email: email };
        const user = await usersCollection.findOne(query);
        if (!user) {
          return res.status(404).send({ message: 'User not found' });
        }
        res.send(user);
      } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });

    app.put('/users/:email', async (req, res) => {
      const email = req.params.email;
      const updatedUserData = req.body;

      try {
        const filter = { email: email };
        const options = { upsert: false };
        const { email: _, ...updateData } = updatedUserData;

        const updateDoc = {
          $set: updateData
        };

        const result = await usersCollection.updateOne(filter, updateDoc, options);

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: 'User not found' });
        }

        res.send({ success: true, message: 'User updated successfully', result });
      } catch (error) {
        console.error('Error updating user data:', error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });
    // doctor token
    app.get('/users/doctor/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'unauthorized access' });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let doctor = false;
      if (user) {
        doctor = user?.role === 'doctor';
      }
      res.send({ doctor });
    });
    app.patch('/users/doctor/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'doctor'
        }
      };
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });



    // animal
    app.get('/animal', async (req, res) => {
      const result = await animalCollection.find().toArray()
      res.send(result)
    })
    app.get('/animal/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id)
      const query = { _id: new ObjectId(id) }
      const result = await animalCollection.findOne(query)
      res.send(result)
    })


    // Adoption Routes
    app.post('/api/adopt', upload.array('images'), async (req, res) => {
      const { ownerName, contact, address, petName, petBreed, petColor, petAge } = req.body;
      const images = req.files;

      if (!ownerName || !contact || !address || !petName || !petBreed || !petColor || !petAge || !images.length) {
        return res.status(400).json({ message: 'All fields including images are required.' });
      }

      const pet = {
        ownerName, contact, address, petName, petBreed, petColor, petAge,
        images: images.map(img => `/uploads/${img.filename}`),
        createdAt: new Date(),
      };

      const result = await petsCollection.insertOne(pet);
      res.status(200).json({ message: 'Adoption post saved!', petId: result.insertedId });
    });

    app.get('/api/adopt', async (req, res) => {
      try {
        const pets = await petsCollection.find().sort({ createdAt: -1 }).toArray();
        console.log('Pets Data:', pets); // Add logging to inspect the data
        res.status(200).json(pets);
      } catch (error) {
        console.error('Error fetching pets:', error);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // DELETE a post by ID
    app.delete('/api/adopt/:id', async (req, res) => {
      try {
        const result = await petsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        if (!result.deletedCount) {
          return res.status(404).json({ message: "Post not found" });
        }
        res.json({ message: "Post deleted successfully" });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });


    // Upload Missing Pet Post
    app.post('/api/missing-pet', upload.single('image'), async (req, res) => {
      const { description } = req.body;
      const imageFile = req.file;

      if (!description || !imageFile) {
        return res.status(400).json({ message: 'Description and image are required.' });
      }

      const fs = require('fs');
      const imageBuffer = fs.readFileSync(imageFile.path);
      const base64Image = imageBuffer.toString('base64');

      const newPost = {
        description,
        image: base64Image,
        imageType: imageFile.mimetype,
        createdAt: new Date(),
        comments: [] // <--- New field for storing comments
      };

      const result = await missingPostsCollection.insertOne(newPost);

      // Optional: delete the local file after saving to DB
      fs.unlinkSync(imageFile.path);

      res.status(200).json({
        message: 'Post submitted successfully!',
        postId: result.insertedId,
        post: newPost
      });
    });
    app.get('/api/missing-pet', async (req, res) => {
      try {
        const posts = await missingPostsCollection.find({}).toArray();
        res.status(200).json(posts);
      } catch (error) {
        res.status(500).json({ message: 'Failed to fetch missing pet posts.' });
      }
    });

    app.post('/api/missing-posts/:id/comments', async (req, res) => {
      const postId = req.params.id;
      const { userName, text } = req.body;

      if (!userName || !text) {
        return res.status(400).json({ message: 'User name and comment text are required' });
      }

      const comment = {
        userName,
        text,
        createdAt: new Date(),
      };

      const result = await missingPostsCollection.updateOne(
        { _id: new ObjectId(postId) },
        { $push: { comments: comment } }
      );

      if (result.modifiedCount === 0) {
        return res.status(404).json({ message: 'Post not found or comment not added' });
      }

      res.status(200).json({ message: 'Comment added successfully', comment });
    });

    // Get all posts
    app.get('/api/missing-posts', async (req, res) => {
      const posts = await missingPostsCollection.find().sort({ createdAt: -1 }).toArray();
      res.status(200).json(posts);
    });

    // Upload Rescueing Pet Post
    app.post('/api/rescue-pet', upload.single('image'), async (req, res) => {
      const { details } = req.body;
      const imageFile = req.file;

      if (!details || !imageFile) {
        return res.status(400).json({ message: 'details and image are required.' });
      }

      const fs = require('fs');
      const imageBuffer = fs.readFileSync(imageFile.path);
      const base64Image = imageBuffer.toString('base64');

      const newPost = {
        details,
        image: base64Image,
        imageType: imageFile.mimetype,
        createdAt: new Date(),
        comments: [] // <--- New field for storing comments
      };

      const result = await rescuePostsCollection.insertOne(newPost);

      // Optional: delete the local file after saving to DB
      fs.unlinkSync(imageFile.path);

      res.status(200).json({
        message: 'Post submitted successfully!',
        postId: result.insertedId,
        post: newPost
      });
    });

    app.post('/api/rescue-posts/:id/comments', async (req, res) => {
      const postId = req.params.id;
      const { userName, text } = req.body;

      if (!userName || !text) {
        return res.status(400).json({ message: 'User name and comment text are required' });
      }

      const comment = {
        userName,
        text,
        createdAt: new Date(),
      };

      const result = await rescuePostsCollection.updateOne(
        { _id: new ObjectId(postId) },
        { $push: { comments: comment } }
      );

      if (result.modifiedCount === 0) {
        return res.status(404).json({ message: 'Post not found or comment not added' });
      }

      res.status(200).json({ message: 'Comment added successfully', comment });
    });

    // Get all posts
    // app.get('/api/rescue-posts', async (req, res) => {
    //   const posts = await rescuePostsCollection.find().sort({ createdAt: -1 }).toArray();
    //   res.status(200).json(posts);
    // });

    // Get all posts with sorting and index assurance
    app.get('/api/rescue-posts', async (req, res) => {
      try {
        // Ensure index exists to prevent memory limit error during sort
        await rescuePostsCollection.createIndex({ createdAt: -1 });

        const posts = await rescuePostsCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).json(posts);
      } catch (error) {
        console.error('Error fetching rescue posts:', error);
        res.status(500).json({ message: 'Failed to fetch rescue posts' });
      }
    });


    // Gemini AI Chat Endpoint //################################################################################
    app.post('/chat', async (req, res) => {
      try {
        const userMessage = req.body.message;

        if (!process.env.GEMINI_API_KEY) {
          console.error('GEMINI_API_KEY not found in environment variables');
          return res.status(500).json({ error: 'API key not configured' });
        }

        // Initialize Gemini AI with the correct model
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: "gemini-2.0-flash" // Using the model from your curl command
        });

        // Format the request similar to the curl command
        const result = await model.generateContent({
          contents: [{
            parts: [{ text: userMessage }]
          }]
        });

        const response = await result.response;
        const text = response.text();

        res.json({ reply: text });
      } catch (error) {
        console.error('Error with Gemini API:', error);
        res.status(500).json({ error: error.message });
      }
    });

    app.get('/test-gemini', async (req, res) => {
      try {
        if (!process.env.GEMINI_API_KEY) {
          return res.status(500).json({ error: 'API key not configured' });
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const result = await model.generateContent({
          contents: [{
            parts: [{ text: "Tell me a short fact about dogs." }]
          }]
        });

        const response = await result.response;
        const text = response.text();

        res.json({ success: true, response: text });
      } catch (error) {
        console.error('Test Gemini API Error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    //#############################################################################################################


    // ============= INVENTORY MANAGEMENT ===============

    // Create new product
    // app.post('/api/products', upload.single('image'), async (req, res) => {
    //   try {
    //     const { name, description, price, category, stockQuantity } = req.body;
    //     const imageFile = req.file;

    //     if (!name || !price || !stockQuantity) {
    //       return res.status(400).json({ message: 'Name, price and stock quantity are required' });
    //     }

    //     const product = {
    //       name,
    //       description,
    //       price: parseFloat(price),
    //       category,
    //       stockQuantity: parseInt(stockQuantity),
    //       image: imageFile ? `/uploads/${imageFile.filename}` : null,
    //       createdAt: new Date(),
    //       updatedAt: new Date()
    //     };

    //     const result = await productsCollection.insertOne(product);
    //     res.status(201).json({
    //       message: 'Product added successfully',
    //       productId: result.insertedId
    //     });
    //   } catch (error) {
    //     console.error('Error adding product:', error);
    //     res.status(500).json({ message: 'Server error' });
    //   }
    // });
    app.post('/api/products', async (req, res) => {
      try {
        const { name, description, price, category, stockQuantity, image } = req.body;

        if (!name || !price || !stockQuantity) {
          return res.status(400).json({ message: 'Name, price and stock quantity are required' });
        }

        const product = {
          name,
          description,
          price: parseFloat(price),
          category,
          stockQuantity: parseInt(stockQuantity),
          image: image || null, // image is a URL from ImgBB
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const result = await productsCollection.insertOne(product);
        res.status(201).json({
          message: 'Product added successfully',
          productId: result.insertedId
        });

      } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ message: 'Server error' });
      }
    });


    // Get all products
    app.get('/api/products', async (req, res) => {
      try {
        const { category, inStock } = req.query;
        let query = {};

        if (category) {
          query.category = category;
        }

        if (inStock === 'true') {
          query.stockQuantity = { $gt: 0 };
        }

        const products = await productsCollection.find(query).toArray();
        res.status(200).json(products);
      } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // Get product by ID
    app.get('/api/products/:id', async (req, res) => {
      try {
        const product = await productsCollection.findOne({ _id: new ObjectId(req.params.id) });

        if (!product) {
          return res.status(404).json({ message: 'Product not found' });
        }

        res.status(200).json(product);
      } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // Update product
    app.put('/api/products/:id', upload.single('image'), async (req, res) => {
      try {
        const productId = req.params.id;
        const { name, description, price, category, stockQuantity } = req.body;
        const imageFile = req.file;

        const updateData = {
          name,
          description,
          price: parseFloat(price),
          category,
          stockQuantity: parseInt(stockQuantity),
          updatedAt: new Date()
        };

        if (imageFile) {
          updateData.image = `/uploads/${imageFile.filename}`;
        }

        const result = await productsCollection.updateOne(
          { _id: new ObjectId(productId) },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: 'Product not found' });
        }

        res.status(200).json({ message: 'Product updated successfully' });
      } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // Delete product
    app.delete('/api/products/:id', async (req, res) => {
      try {
        const result = await productsCollection.deleteOne({ _id: new ObjectId(req.params.id) });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: 'Product not found' });
        }

        res.status(200).json({ message: 'Product deleted successfully' });
      } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // Update stock quantity
    app.patch('/api/products/:id/stock', async (req, res) => {
      try {
        const { quantity } = req.body;

        if (quantity === undefined || isNaN(parseInt(quantity))) {
          return res.status(400).json({ message: 'Valid quantity is required' });
        }

        const result = await productsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { stockQuantity: parseInt(quantity), updatedAt: new Date() } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: 'Product not found' });
        }

        res.status(200).json({ message: 'Stock updated successfully' });
      } catch (error) {
        console.error('Error updating stock:', error);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // ============= PAYMENT & ORDER PROCESSING ===============

    // Create new order
    app.post('/api/orders', verifyToken, async (req, res) => {
      try {
        const email = req.decoded.email;
        const { items, shippingAddress, paymentMethod, paymentDetails } = req.body;


        if (!items || !items.length || !shippingAddress || !paymentMethod) {
          return res.status(400).json({ message: 'Items, shipping address, and payment method are required' });
        }

        // Calculate total and validate stock
        let totalAmount = 0;
        const orderItems = [];

        for (const item of items) {
          const product = await productsCollection.findOne({ _id: new ObjectId(item.productId) });

          if (!product) {
            return res.status(404).json({ message: `Product ${item.productId} not found` });
          }

          if (product.stockQuantity < item.quantity) {
            return res.status(400).json({
              message: `Not enough stock for ${product.name}. Available: ${product.stockQuantity}`
            });
          }

          const itemTotal = product.price * item.quantity;
          totalAmount += itemTotal;

          orderItems.push({
            productId: product._id,
            name: product.name,
            price: product.price,
            quantity: item.quantity,
            subtotal: itemTotal
          });

          // Update stock
          await productsCollection.updateOne(
            { _id: product._id },
            { $inc: { stockQuantity: -item.quantity } }
          );
        }

        // Create order
        const order = {
          userEmail: email,
          items: orderItems,
          totalAmount,
          shippingAddress,
          paymentMethod,
          paymentStatus: 'pending',
          orderStatus: 'processing',
          createdAt: new Date()
        };

        const orderResult = await ordersCollection.insertOne(order);

        // Process payment based on method
        let paymentResult;
        const paymentData = {
          orderId: orderResult.insertedId,
          amount: totalAmount,
          method: paymentMethod,
          status: 'pending',
          details: paymentDetails || {},
          createdAt: new Date()
        };

        // Simplified payment processing logic - in real app, integrate payment gateways
        if (paymentMethod === 'credit_card') {
          // Simulate payment processing
          paymentData.status = 'completed';
          paymentData.transactionId = 'CC-' + Date.now();
        } else if (paymentMethod === 'paypal') {
          paymentData.status = 'completed';
          paymentData.transactionId = 'PP-' + Date.now();
        } else if (paymentMethod === 'cod') {
          paymentData.status = 'pending';
        }

        paymentResult = await paymentsCollection.insertOne(paymentData);

        // Update order with payment status
        await ordersCollection.updateOne(
          { _id: orderResult.insertedId },
          {
            $set: {
              paymentStatus: paymentData.status,
              paymentId: paymentResult.insertedId
            }
          }
        );

        res.status(201).json({
          message: 'Order placed successfully',
          orderId: orderResult.insertedId,
          paymentStatus: paymentData.status
        });
      } catch (error) {
        console.error('Error processing order:', error);
        res.status(500).json({ message: 'Error processing your order' });
      }
    });

    // Get user orders
    app.get('/api/orders', verifyToken, async (req, res) => {
      try {
        const email = req.decoded.email;
        const orders = await ordersCollection.find({ userEmail: email }).sort({ createdAt: -1 }).toArray();
        res.status(200).json(orders);
      } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // Get order by ID
    app.get('/api/orders/:id', verifyToken, async (req, res) => {
      try {
        const order = await ordersCollection.findOne({ _id: new ObjectId(req.params.id) });

        if (!order) {
          return res.status(404).json({ message: 'Order not found' });
        }

        // Verify user owns this order or is admin
        if (order.userEmail !== req.decoded.email) {
          // Check if admin
          const user = await usersCollection.findOne({ email: req.decoded.email });
          if (!user || user.role !== 'admin') {
            return res.status(403).json({ message: 'Unauthorized access to this order' });
          }
        }

        res.status(200).json(order);
      } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ message: 'Server error' });
      }
    });

    // Admin only - Update order status
    app.patch('/api/orders/:id/status', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { orderStatus } = req.body;

        if (!orderStatus) {
          return res.status(400).json({ message: 'Order status is required' });
        }

        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { orderStatus, updatedAt: new Date() } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: 'Order not found' });
        }

        res.status(200).json({ message: 'Order status updated successfully' });
      } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ message: 'Server error' });
      }
    });




    app.post('/api/adoptedPets', async (req, res) => {
      try {
        const pet = req.body;
        pet.status = false; // ensure status is false

        // Optional: Check for duplicate by _id if needed
        // const existing = await adoptedPets.findOne({ _id: pet._id });
        // if (existing) {
        //   return res.status(409).json({ message: "Pet already adopted" });
        // }

        const result = await adoptedPets.insertOne(pet);
        res.status(201).json(result);
      } catch (error) {
        console.error('Error saving adopted pet:', error);
        res.status(500).json({ message: 'Server error' });
      }
    });

    app.get('/api/adoptedPets', async (req, res) => {
      try {
        const adoptedPetsList = await adoptedPets.find().toArray(); // Fetch all adopted pets
        res.status(200).json(adoptedPetsList); // Return the list of adopted pets
      } catch (error) {
        console.error('Error fetching adopted pets:', error);
        res.status(500).json({ message: 'Server error' });
      }
    });

    app.patch('/api/adoptedPets/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await adoptedPets.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: true } }
        );
        res.status(200).json(result);
      } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ message: 'Server error' });
      }
    });

    app.delete('/api/adoptedPets/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await adoptedPets.deleteOne({ _id: new ObjectId(id) });
        res.status(200).json(result);
      } catch (error) {
        console.error('Error deleting pet:', error);
        res.status(500).json({ message: 'Server error' });
      }
    });







    // Get users in queue for a doctor
    app.get('/api/queue', verifyToken, async (req, res) => {
      const { doctorId } = req.query;
      try {
        const queue = await queueCollection.find({ doctorId, status: 'waiting' }).toArray();
        res.send(queue); // ✅ Must send an array
      } catch (error) {
        console.error("Error fetching queue:", error);
        res.status(500).json({ message: 'Error fetching queue' });
      }
    });
    // Add this to your Express server
    app.post('/api/queue', verifyToken, async (req, res) => {
      const { email, petName, petAge, problem } = req.body;

      try {
        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }

        const queueData = {
          userId: user._id,
          petName,
          petAge,
          problem,
          status: 'waiting',
          createdAt: new Date()
        };

        const result = await queueCollection.insertOne(queueData);
        res.status(201).json({ insertedId: result.insertedId });
      } catch (err) {
        console.error('❌ Error adding to queue:', err);
        res.status(500).json({ message: 'Failed to add to queue' });
      }
    });


    // Doctor accepts user from queue
    app.post('/api/queue/accept', verifyToken, async (req, res) => {
      const { doctorId, userId } = req.body;

      try {
        const result = await queueCollection.findOneAndUpdate(
          {
            doctorId,
            _id: new ObjectId(userId),
            status: 'waiting'
          },
          {
            $set: {
              status: 'accepted',
              acceptedAt: new Date()
            }
          },
          { returnDocument: 'after' }
        );

        if (!result.value) {
          return res.status(404).json({ message: "Queue item not found or already accepted" });
        }

        res.status(200).json(result.value);
      } catch (err) {
        console.error("❌ Error accepting user from queue:", err);
        res.status(500).json({ message: "Server error while accepting user from queue" });
      }
    });



    //Doctor submit prescription
    app.post('/api/prescriptions', async (req, res) => {
      const { doctorId, userId, text } = req.body;
      try {
        const prescription = {
          doctorId,
          userId,
          text,
          createdAt: new Date()
        };
        const result = await prescriptionsCollection.insertOne(prescription);
        res.send(result);
      } catch (error) {
        res.status(500).json({ message: 'Error saving prescription' });
      }
    });



    app.get('/api/prescriptions', async (req, res) => {
      try {
        const result = await prescriptionsCollection.find({}).toArray(); // fetch everything
        res.send(result);
      } catch (error) {
        res.status(500).json({ message: 'Error fetching prescriptions' });
      }
    });


    //Queue bookappointment
    app.post('/api/queue', async (req, res) => {
      const queueData = req.body;

      try {
        const result = await queueCollection.insertOne(queueData);
        res.status(201).json({ message: 'Added to queue', id: result.insertedId });
      } catch (error) {
        console.error("Queue insert error:", error);
        res.status(500).json({ message: "Failed to add to queue" });
      }
    });


    // POST /api/doctors
    app.post('/doctors', async (req, res) => {
      try {
        const doctor = req.body; // expects name, image, institution, graduationYear, specialty, experience
        const result = await doctorCollection.insertOne(doctor);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Failed to save doctor info' });
      }
    });










    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();/
  }
}
run().catch(console.dir);





app.get('/', (req, res) => {
  res.send('Online')
})

app.listen(port, () => {
  console.log(`Online market is ready ${port}`);

})