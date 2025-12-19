const nodemailer = require('nodemailer');
const { logger } = require('./logger');

// Create transporter
const createTransporter = () => {
  const port = parseInt(process.env.EMAIL_PORT, 10) || 587;
  const secure = port === 465; // true only for 465, false for 587

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST, // e.g. smtpout.secureserver.net
    port,
    secure,
    auth: {
      user: process.env.EMAIL_USER, // your full email: support@vibebites.shop
      pass: process.env.EMAIL_PASS
    },
    // GoDaddy-specific settings (same as working test.js)
    tls: {
      rejectUnauthorized: false
    },
    connectionTimeout: 60000,
    greetingTimeout: 30000,
    socketTimeout: 60000
  });
};
// Email templates
const emailTemplates = {
  welcomeEmail: (data) => ({
    subject: 'Welcome to VIBE BITES!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #D9A25F; padding: 20px; text-align: center;">
          <h1 style="color: #5A3B1C; margin: 0;">VIBE BITES</h1>
          <p style="color: #5A3B1C; margin: 10px 0 0 0;">Vibe Every Bite</p>
        </div>
        <div style="padding: 30px; background-color: #FFF4E0;">
          <h2 style="color: #5A3B1C;">Welcome to VIBE BITES!</h2>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Hi ${data.name},
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Welcome to VIBE BITES! We're excited to have you join our community of healthy snack lovers.
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Your account has been created successfully. You can now:
          </p>
          <ul style="color: #5A3B1C; line-height: 1.6;">
            <li>Browse our delicious range of healthy snacks</li>
            <li>Place orders and get them delivered to your doorstep</li>
            <li>Track your orders in real-time</li>
            <li>Enjoy exclusive offers and discounts</li>
          </ul>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.CORS_ORIGIN || 'http://localhost:3000'}" 
               style="background-color: #D9A25F; color: #5A3B1C; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">
              Start Shopping
            </a>
          </div>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Thank you for choosing VIBE BITES. We look forward to serving you!
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Best regards,<br>
            The VIBE BITES Team
          </p>
        </div>
        <div style="background-color: #5A3B1C; padding: 20px; text-align: center;">
          <p style="color: #FFF4E0; margin: 0; font-size: 12px;">
            © 2024 VIBE BITES. All rights reserved.
          </p>
        </div>
      </div>
    `
  }),

  orderConfirmation: (data) => ({
    subject: `Order Confirmation - ${data.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #D9A25F; padding: 20px; text-align: center;">
          <h1 style="color: #5A3B1C; margin: 0;">VIBE BITES</h1>
          <p style="color: #5A3B1C; margin: 10px 0 0 0;">Vibe Every Bite</p>
        </div>
        <div style="padding: 30px; background-color: #FFF4E0;">
          <h2 style="color: #5A3B1C;">Order Confirmation</h2>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Hi ${data.name},
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Thank you for your order! We've received your order and are preparing it for shipment.
          </p>
          <div style="background-color: #D9A25F; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #5A3B1C; margin: 0 0 10px 0;">Order Details</h3>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Order Date:</strong> ${data.orderDate}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Total Amount:</strong> ₹${data.total}</p>
          </div>
          <p style="color: #5A3B1C; line-height: 1.6;">
            We'll send you another email with tracking information once your order ships.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.CORS_ORIGIN || 'http://localhost:3000'}/track-order" 
               style="background-color: #D9A25F; color: #5A3B1C; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">
              Track Your Order
            </a>
          </div>
          <p style="color: #5A3B1C; line-height: 1.6;">
            If you have any questions, feel free to contact us.
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Best regards,<br>
            The VIBE BITES Team
          </p>
        </div>
        <div style="background-color: #5A3B1C; padding: 20px; text-align: center;">
          <p style="color: #FFF4E0; margin: 0; font-size: 12px;">
            © 2024 VIBE BITES. All rights reserved.
          </p>
        </div>
      </div>
    `
  }),

  cancelRequest: (data) => ({
    subject: `Cancellation Request - ${data.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #D9A25F; padding: 20px; text-align: center;">
          <h1 style="color: #5A3B1C; margin: 0;">VIBE BITES</h1>
          <p style="color: #5A3B1C; margin: 10px 0 0 0;">Vibe Every Bite</p>
        </div>
        <div style="padding: 30px; background-color: #FFF4E0;">
          <h2 style="color: #5A3B1C;">New Cancellation Request</h2>
          <div style="background-color: #D9A25F; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #5A3B1C; margin: 0 0 10px 0;">Order Details</h3>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Customer:</strong> ${data.customerName}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Email:</strong> ${data.customerEmail}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Order Total:</strong> ₹${data.orderTotal}</p>
          </div>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #5A3B1C; margin: 0 0 10px 0;">Cancellation Details</h3>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Reason:</strong> ${data.reason.replace('_', ' ').toUpperCase()}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Description:</strong> ${data.description}</p>
          </div>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Please review this cancellation request in the admin panel and take appropriate action.
          </p>
        </div>
        <div style="background-color: #5A3B1C; padding: 20px; text-align: center;">
          <p style="color: #FFF4E0; margin: 0; font-size: 12px;">
            © 2024 VIBE BITES. All rights reserved.
          </p>
        </div>
      </div>
    `
  }),

  returnRequest: (data) => ({
    subject: `Return Request - ${data.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #D9A25F; padding: 20px; text-align: center;">
          <h1 style="color: #5A3B1C; margin: 0;">VIBE BITES</h1>
          <p style="color: #5A3B1C; margin: 10px 0 0 0;">Vibe Every Bite</p>
        </div>
        <div style="padding: 30px; background-color: #FFF4E0;">
          <h2 style="color: #5A3B1C;">New Return Request</h2>
          <div style="background-color: #D9A25F; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #5A3B1C; margin: 0 0 10px 0;">Order Details</h3>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Customer:</strong> ${data.customerName}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Email:</strong> ${data.customerEmail}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Order Total:</strong> ₹${data.orderTotal}</p>
          </div>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #5A3B1C; margin: 0 0 10px 0;">Return Details</h3>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Reason:</strong> ${data.reason.replace('_', ' ').toUpperCase()}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Description:</strong> ${data.description}</p>
          </div>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Please review this return request in the admin panel and take appropriate action.
          </p>
        </div>
        <div style="background-color: #5A3B1C; padding: 20px; text-align: center;">
          <p style="color: #FFF4E0; margin: 0; font-size: 12px;">
            © 2024 VIBE BITES. All rights reserved.
          </p>
        </div>
      </div>
    `
  }),

  orderCancelled: (data) => ({
    subject: `Order Cancelled - ${data.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #D9A25F; padding: 20px; text-align: center;">
          <h1 style="color: #5A3B1C; margin: 0;">VIBE BITES</h1>
          <p style="color: #5A3B1C; margin: 10px 0 0 0;">Vibe Every Bite</p>
        </div>
        <div style="padding: 30px; background-color: #FFF4E0;">
          <h2 style="color: #5A3B1C;">Order Cancelled</h2>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Hi ${data.name},
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Your order has been cancelled as requested.
          </p>
          <div style="background-color: #D9A25F; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #5A3B1C; margin: 0 0 10px 0;">Order Details</h3>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
          </div>
          <p style="color: #5A3B1C; line-height: 1.6;">
            ${data.notes}
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            If you have any questions, feel free to contact us.
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Best regards,<br>
            The VIBE BITES Team
          </p>
        </div>
        <div style="background-color: #5A3B1C; padding: 20px; text-align: center;">
          <p style="color: #FFF4E0; margin: 0; font-size: 12px;">
            © 2024 VIBE BITES. All rights reserved.
          </p>
        </div>
      </div>
    `
  }),

  returnProcessed: (data) => ({
    subject: `Return Processed - ${data.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #D9A25F; padding: 20px; text-align: center;">
          <h1 style="color: #5A3B1C; margin: 0;">VIBE BITES</h1>
          <p style="color: #5A3B1C; margin: 10px 0 0 0;">Vibe Every Bite</p>
        </div>
        <div style="padding: 30px; background-color: #FFF4E0;">
          <h2 style="color: #5A3B1C;">Return Processed</h2>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Hi ${data.name},
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Your return has been processed successfully.
          </p>
          <div style="background-color: #D9A25F; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #5A3B1C; margin: 0 0 10px 0;">Return Details</h3>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Refund Amount:</strong> ₹${data.refundAmount}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Refund Method:</strong> ${data.refundMethod.replace('_', ' ').toUpperCase()}</p>
          </div>
          <p style="color: #5A3B1C; line-height: 1.6;">
            ${data.notes}
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            If you have any questions, feel free to contact us.
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Best regards,<br>
            The VIBE BITES Team
          </p>
        </div>
        <div style="background-color: #5A3B1C; padding: 20px; text-align: center;">
          <p style="color: #FFF4E0; margin: 0; font-size: 12px;">
            © 2024 VIBE BITES. All rights reserved.
          </p>
        </div>
      </div>
    `
  }),

  cancelRequestProcessed: (data) => ({
    subject: `Cancellation Request ${data.approved ? 'Approved' : 'Rejected'} - ${data.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #D9A25F; padding: 20px; text-align: center;">
          <h1 style="color: #5A3B1C; margin: 0;">VIBE BITES</h1>
          <p style="color: #5A3B1C; margin: 10px 0 0 0;">Vibe Every Bite</p>
        </div>
        <div style="padding: 30px; background-color: #FFF4E0;">
          <h2 style="color: #5A3B1C;">Cancellation Request ${data.approved ? 'Approved' : 'Rejected'}</h2>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Hi ${data.name},
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Your cancellation request for order ${data.orderNumber} has been ${data.approved ? 'approved' : 'rejected'}.
          </p>
          <div style="background-color: #D9A25F; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #5A3B1C; margin: 0 0 10px 0;">Order Details</h3>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Status:</strong> ${data.approved ? 'CANCELLED' : 'REJECTED'}</p>
          </div>
          <p style="color: #5A3B1C; line-height: 1.6;">
            ${data.notes}
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            If you have any questions, feel free to contact us.
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Best regards,<br>
            The VIBE BITES Team
          </p>
        </div>
        <div style="background-color: #5A3B1C; padding: 20px; text-align: center;">
          <p style="color: #FFF4E0; margin: 0; font-size: 12px;">
            © 2024 VIBE BITES. All rights reserved.
          </p>
        </div>
      </div>
    `
  }),

  returnRequestProcessed: (data) => ({
    subject: `Return Request ${data.approved ? 'Approved' : 'Rejected'} - ${data.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #D9A25F; padding: 20px; text-align: center;">
          <h1 style="color: #5A3B1C; margin: 0;">VIBE BITES</h1>
          <p style="color: #5A3B1C; margin: 10px 0 0 0;">Vibe Every Bite</p>
        </div>
        <div style="padding: 30px; background-color: #FFF4E0;">
          <h2 style="color: #5A3B1C;">Return Request ${data.approved ? 'Approved' : 'Rejected'}</h2>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Hi ${data.name},
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Your return request for order ${data.orderNumber} has been ${data.approved ? 'approved' : 'rejected'}.
          </p>
          ${data.approved ? `
          <div style="background-color: #D9A25F; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #5A3B1C; margin: 0 0 10px 0;">Refund Details</h3>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Refund Amount:</strong> ₹${data.refundAmount}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Refund Method:</strong> ${data.refundMethod.replace('_', ' ').toUpperCase()}</p>
            ${data.returnTrackingNumber ? `<p style="color: #5A3B1C; margin: 5px 0;"><strong>Return Tracking:</strong> ${data.returnTrackingNumber}</p>` : ''}
          </div>
          ` : ''}
          <p style="color: #5A3B1C; line-height: 1.6;">
            ${data.notes}
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            If you have any questions, feel free to contact us.
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Best regards,<br>
            The VIBE BITES Team
          </p>
        </div>
        <div style="background-color: #5A3B1C; padding: 20px; text-align: center;">
          <p style="color: #FFF4E0; margin: 0; font-size: 12px;">
            © 2024 VIBE BITES. All rights reserved.
          </p>
        </div>
      </div>
    `
  }),

  newReview: (data) => ({
    subject: `New Review - ${data.productName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #D9A25F; padding: 20px; text-align: center;">
          <h1 style="color: #5A3B1C; margin: 0;">VIBE BITES</h1>
          <p style="color: #5A3B1C; margin: 10px 0 0 0;">Vibe Every Bite</p>
        </div>
        <div style="padding: 30px; background-color: #FFF4E0;">
          <h2 style="color: #5A3B1C;">New Product Review</h2>
          <p style="color: #5A3B1C; line-height: 1.6;">
            A customer has left a new review for one of your products.
          </p>
          <div style="background-color: #D9A25F; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #5A3B1C; margin: 0 0 10px 0;">Review Details</h3>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Product:</strong> ${data.productName}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Customer:</strong> ${data.customerName}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Rating:</strong> ${data.rating}/5 ⭐</p>
          </div>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #5A3B1C; margin: 0 0 10px 0;">Review Content</h3>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Title:</strong> ${data.title}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Comment:</strong> ${data.comment}</p>
          </div>
          <p style="color: #5A3B1C; line-height: 1.6;">
            You can view and manage this review in the admin panel.
          </p>
        </div>
        <div style="background-color: #5A3B1C; padding: 20px; text-align: center;">
          <p style="color: #FFF4E0; margin: 0; font-size: 12px;">
            © 2024 VIBE BITES. All rights reserved.
          </p>
        </div>
      </div>
    `
  }),

  passwordReset: (data) => ({
    subject: 'Reset your VIBE BITES password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #D9A25F; padding: 20px; text-align: center;">
          <h1 style="color: #5A3B1C; margin: 0;">VIBE BITES</h1>
          <p style="color: #5A3B1C; margin: 10px 0 0 0;">Vibe Every Bite</p>
        </div>
        <div style="padding: 30px; background-color: #FFF4E0;">
          <h2 style="color: #5A3B1C;">Password Reset Request</h2>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Hi ${data.name},
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            We received a request to reset your password. Click the button below to create a new password:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.resetUrl}" 
               style="background-color: #D9A25F; color: #5A3B1C; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color: #5A3B1C; line-height: 1.6;">
            If you didn't request this password reset, you can safely ignore this email.
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            This link will expire in 1 hour.
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Best regards,<br>
            The VIBE BITES Team
          </p>
        </div>
        <div style="background-color: #5A3B1C; padding: 20px; text-align: center;">
          <p style="color: #FFF4E0; margin: 0; font-size: 12px;">
            © 2024 VIBE BITES. All rights reserved.
          </p>
        </div>
      </div>
    `
  }),

  orderConfirmation: (data) => ({
    subject: `Order Confirmation - ${data.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #D9A25F; padding: 20px; text-align: center;">
          <h1 style="color: #5A3B1C; margin: 0;">VIBE BITES</h1>
          <p style="color: #5A3B1C; margin: 10px 0 0 0;">Vibe Every Bite</p>
        </div>
        <div style="padding: 30px; background-color: #FFF4E0;">
          <h2 style="color: #5A3B1C;">Order Confirmation</h2>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Hi ${data.name},
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Thank you for your order! Your order has been confirmed and is being processed.
          </p>
          <div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3 style="color: #5A3B1C; margin-top: 0;">Order Details</h3>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Order Date:</strong> ${data.orderDate}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Total Amount:</strong> ₹${data.total}</p>
          </div>
          <p style="color: #5A3B1C; line-height: 1.6;">
            We'll send you another email when your order ships.
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Best regards,<br>
            The VIBE BITES Team
          </p>
        </div>
        <div style="background-color: #5A3B1C; padding: 20px; text-align: center;">
          <p style="color: #FFF4E0; margin: 0; font-size: 12px;">
            © 2024 VIBE BITES. All rights reserved.
          </p>
        </div>
      </div>
    `
  }),

  orderShipped: (data) => ({
    subject: `Your order has been shipped - ${data.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #D9A25F; padding: 20px; text-align: center;">
          <h1 style="color: #5A3B1C; margin: 0;">VIBE BITES</h1>
          <p style="color: #5A3B1C; margin: 10px 0 0 0;">Vibe Every Bite</p>
        </div>
        <div style="padding: 30px; background-color: #FFF4E0;">
          <h2 style="color: #5A3B1C;">Your Order Has Been Shipped!</h2>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Hi ${data.name},
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Great news! Your order has been shipped and is on its way to you.
          </p>
          <div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3 style="color: #5A3B1C; margin-top: 0;">Shipping Details</h3>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Order Number:</strong> ${data.orderNumber}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Tracking Number:</strong> ${data.trackingNumber}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Carrier:</strong> ${data.carrier}</p>
            <p style="color: #5A3B1C; margin: 5px 0;"><strong>Estimated Delivery:</strong> ${data.estimatedDelivery}</p>
          </div>
          <p style="color: #5A3B1C; line-height: 1.6;">
            You can track your package using the tracking number above.
          </p>
          <p style="color: #5A3B1C; line-height: 1.6;">
            Best regards,<br>
            The VIBE BITES Team
          </p>
        </div>
        <div style="background-color: #5A3B1C; padding: 20px; text-align: center;">
          <p style="color: #FFF4E0; margin: 0; font-size: 12px;">
            © 2024 VIBE BITES. All rights reserved.
          </p>
        </div>
      </div>
    `
  })
};

// Send email function
const sendEmail = async ({ to, subject, template, data }) => {
  try {
    const transporter = createTransporter();
    
    // Get template
    const emailTemplate = emailTemplates[template];
    if (!emailTemplate) {
      throw new Error(`Email template '${template}' not found`);
    }

    const { html } = emailTemplate(data);

    const mailOptions = {
      from: `"VIBE BITES" <${process.env.EMAIL_USER}>`,
      to,
      subject: subject || emailTemplate.subject,
      html
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info('Email sent successfully:', info.messageId);
    return info;
  } catch (error) {
    logger.error('Email sending error:', error);
    throw error;
  }
};

// Send custom email
const sendCustomEmail = async ({ to, subject, html, text }) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"VIBE BITES" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info('Custom email sent successfully:', info.messageId);
    return info;
  } catch (error) {
    logger.error('Custom email sending error:', error);
    throw error;
  }
};

module.exports = {
  sendEmail,
  sendCustomEmail
}; 