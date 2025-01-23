// server.js
const express = require('express');
const mysql = require('mysql2');
const dotenv = require('dotenv');
const cors = require('cors');
//hshsh
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Database connection
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
}).promise();

// Updated Database schema with single table
const schema = `
CREATE TABLE IF NOT EXISTS spaces (
  id INT AUTO_INCREMENT PRIMARY KEY,
  space_id VARCHAR(20) UNIQUE NOT NULL,
  type VARCHAR(100) NOT NULL,
  media JSON,
  price DECIMAL(10,2) NOT NULL,
  description TEXT,
  pincode VARCHAR(10),
  google_maps_url TEXT,
  availability JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;
const vendorSchema = `
CREATE TABLE IF NOT EXISTS vendors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  firm_name VARCHAR(255),
  phone_number VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  gst_number VARCHAR(20),
  address TEXT,
  space_ids JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

// Initialize database schema
async function initDB() {
  try {
    await pool.query(schema);
    await pool.query(vendorSchema);
    console.log('Database schemas initialized');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

initDB();

// Generate space ID using timestamp
function generateSpaceId() {
  const timestamp = Date.now();
  return `PR${timestamp}`;
}

// CRUD Endpoints

// Create a new space
app.post('/api/spaces', async (req, res) => {
  try {
    const {
      type,
      media,
      price,
      description,
      pincode,
      google_maps_url,
      availability
    } = req.body;

    const spaceId = generateSpaceId();

    const [result] = await pool.query(
      'INSERT INTO spaces (space_id, type, media, price, description, pincode, google_maps_url, availability) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        spaceId,
        type,
        JSON.stringify(media),
        price,
        description,
        pincode,
        google_maps_url,
        JSON.stringify(availability || {})
      ]
    );

    res.status(201).json({ 
      id: result.insertId,
      space_id: spaceId, 
      message: 'Space created successfully' 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creating space' });
  }
});

// Get all spaces
app.get('/api/spaces', async (req, res) => {
  try {
    const [spaces] = await pool.query('SELECT * FROM spaces');
    res.json(spaces);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching spaces' });
  }
});

// Get space by space_id
app.get('/api/spaces/:spaceId', async (req, res) => {
  try {
    const [spaces] = await pool.query('SELECT * FROM spaces WHERE space_id = ?', [req.params.spaceId]);
    if (spaces.length === 0) {
      return res.status(404).json({ error: 'Space not found' });
    }
    res.json(spaces[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching space' });
  }
});

// Update space
app.put('/api/spaces/:spaceId', async (req, res) => {
  try {
    const {
      type,
      media,
      price,
      description,
      pincode,
      google_maps_url,
      availability
    } = req.body;

    const [result] = await pool.query(
      'UPDATE spaces SET type = ?, media = ?, price = ?, description = ?, pincode = ?, google_maps_url = ?, availability = ? WHERE space_id = ?',
      [
        type,
        JSON.stringify(media),
        price,
        description,
        pincode,
        google_maps_url,
        JSON.stringify(availability || {}),
        req.params.spaceId
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Space not found' });
    }

    res.json({ message: 'Space updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error updating space' });
  }
});

// Delete space
app.delete('/api/spaces/:spaceId', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM spaces WHERE space_id = ?', [req.params.spaceId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Space not found' });
    }
    
    res.json({ message: 'Space deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error deleting space' });
  }
});

// Check availability for a specific date range
app.get('/api/spaces/:spaceId/availability', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    const [space] = await pool.query('SELECT availability FROM spaces WHERE space_id = ?', [req.params.spaceId]);
    
    if (space.length === 0) {
      return res.status(404).json({ error: 'Space not found' });
    }

    const availability = JSON.parse(space[0].availability || '{}');
    
    // Filter availability within the date range
    const filteredAvailability = Object.entries(availability)
      .filter(([date]) => date >= start_date && date <= end_date)
      .reduce((obj, [date, status]) => ({...obj, [date]: status}), {});

    res.json(filteredAvailability);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching availability' });
  }
});
// Add these new endpoints to the existing server.js

// Add new availability slots
app.post('/api/spaces/:spaceId/availability', async (req, res) => {
    try {
      const { dates } = req.body; // Expect an array of dates to add
      
      // First get the current availability
      const [space] = await pool.query(
        'SELECT availability FROM spaces WHERE space_id = ?',
        [req.params.spaceId]
      );
      
      if (space.length === 0) {
        return res.status(404).json({ error: 'Space not found' });
      }
  
      // Parse current availability or initialize empty object
      const currentAvailability = JSON.parse(space[0].availability || '{}');
      
      // Add new dates
      dates.forEach(date => {
        currentAvailability[date] = true;
      });
  
      // Update the space with new availability
      await pool.query(
        'UPDATE spaces SET availability = ? WHERE space_id = ?',
        [JSON.stringify(currentAvailability), req.params.spaceId]
      );
  
      res.json({ 
        message: 'Availability slots added successfully',
        availability: currentAvailability
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error adding availability slots' });
    }
  });
  
  // Delete availability slots
  app.delete('/api/spaces/:spaceId/availability', async (req, res) => {
    try {
      const { dates } = req.body; // Expect an array of dates to remove
      
      // First get the current availability
      const [space] = await pool.query(
        'SELECT availability FROM spaces WHERE space_id = ?',
        [req.params.spaceId]
      );
      
      if (space.length === 0) {
        return res.status(404).json({ error: 'Space not found' });
      }
  
      // Parse current availability
      const currentAvailability = JSON.parse(space[0].availability || '{}');
      
      // Remove specified dates
      dates.forEach(date => {
        delete currentAvailability[date];
      });
  
      // Update the space with new availability
      await pool.query(
        'UPDATE spaces SET availability = ? WHERE space_id = ?',
        [JSON.stringify(currentAvailability), req.params.spaceId]
      );
  
      res.json({ 
        message: 'Availability slots removed successfully',
        availability: currentAvailability
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error removing availability slots' });
    }
  });
  
  // Update specific availability slots (mark as available/unavailable)
  app.patch('/api/spaces/:spaceId/availability', async (req, res) => {
    try {
      const { updates } = req.body; // Expect an object of date: status pairs
      
      // First get the current availability
      const [space] = await pool.query(
        'SELECT availability FROM spaces WHERE space_id = ?',
        [req.params.spaceId]
      );
      
      if (space.length === 0) {
        return res.status(404).json({ error: 'Space not found' });
      }
  
      // Parse current availability
      const currentAvailability = JSON.parse(space[0].availability || '{}');
      
      // Apply updates
      Object.entries(updates).forEach(([date, status]) => {
        currentAvailability[date] = status;
      });
  
      // Update the space with new availability
      await pool.query(
        'UPDATE spaces SET availability = ? WHERE space_id = ?',
        [JSON.stringify(currentAvailability), req.params.spaceId]
      );
  
      res.json({ 
        message: 'Availability slots updated successfully',
        availability: currentAvailability
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error updating availability slots' });
    }
  });
// Generate vendor ID using timestamp
function generateVendorId() {
  const timestamp = Date.now();
  return `VN${timestamp}`;
}

// Create a new vendor
app.post('/api/vendors', async (req, res) => {
  try {
    const {
      name,
      firm_name,
      phone_number,
      email,
      gst_number,
      address,
      space_ids = []
    } = req.body;

    const vendorId = generateVendorId();

    const [result] = await pool.query(
      'INSERT INTO vendors (vendor_id, name, firm_name, phone_number, email, gst_number, address, space_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        vendorId,
        name,
        firm_name || null,
        phone_number,
        email,
        gst_number || null,
        address,
        JSON.stringify(space_ids)
      ]
    );

    res.status(201).json({ 
      id: result.insertId,
      vendor_id: vendorId, 
      message: 'Vendor created successfully' 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creating vendor' });
  }
});

// Get all vendors
app.get('/api/vendors', async (req, res) => {
  try {
    const [vendors] = await pool.query('SELECT * FROM vendors');
    res.json(vendors);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching vendors' });
  }
});

// Get vendor by vendor_id
app.get('/api/vendors/:vendorId', async (req, res) => {
  try {
    const [vendors] = await pool.query('SELECT * FROM vendors WHERE vendor_id = ?', [req.params.vendorId]);
    if (vendors.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    res.json(vendors[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching vendor' });
  }
});

// Update vendor
app.put('/api/vendors/:vendorId', async (req, res) => {
  try {
    const {
      name,
      firm_name,
      phone_number,
      email,
      gst_number,
      address,
      space_ids
    } = req.body;

    const [result] = await pool.query(
      'UPDATE vendors SET name = ?, firm_name = ?, phone_number = ?, email = ?, gst_number = ?, address = ?, space_ids = ? WHERE vendor_id = ?',
      [
        name,
        firm_name || null,
        phone_number,
        email,
        gst_number || null,
        address,
        JSON.stringify(space_ids || []),
        req.params.vendorId
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    res.json({ message: 'Vendor updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error updating vendor' });
  }
});

// Delete vendor
app.delete('/api/vendors/:vendorId', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM vendors WHERE vendor_id = ?', [req.params.vendorId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    
    res.json({ message: 'Vendor deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error deleting vendor' });
  }
});

// Add space to vendor's space_ids
app.post('/api/vendors/:vendorId/spaces', async (req, res) => {
  try {
    const { space_id } = req.body;

    const [vendor] = await pool.query('SELECT space_ids FROM vendors WHERE vendor_id = ?', [req.params.vendorId]);
    
    if (vendor.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const currentSpaces = JSON.parse(vendor[0].space_ids || '[]');
    
    if (!currentSpaces.includes(space_id)) {
      currentSpaces.push(space_id);
    }

    await pool.query(
      'UPDATE vendors SET space_ids = ? WHERE vendor_id = ?',
      [JSON.stringify(currentSpaces), req.params.vendorId]
    );

    res.json({ 
      message: 'Space added to vendor successfully',
      space_ids: currentSpaces
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error adding space to vendor' });
  }
});

// Remove space from vendor's space_ids
app.delete('/api/vendors/:vendorId/spaces/:spaceId', async (req, res) => {
  try {
    const [vendor] = await pool.query('SELECT space_ids FROM vendors WHERE vendor_id = ?', [req.params.vendorId]);
    
    if (vendor.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const currentSpaces = JSON.parse(vendor[0].space_ids || '[]');
    const updatedSpaces = currentSpaces.filter(id => id !== req.params.spaceId);

    await pool.query(
      'UPDATE vendors SET space_ids = ? WHERE vendor_id = ?',
      [JSON.stringify(updatedSpaces), req.params.vendorId]
    );

    res.json({ 
      message: 'Space removed from vendor successfully',
      space_ids: updatedSpaces
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error removing space from vendor' });
  }
});
  
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

