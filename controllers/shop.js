const fs = require('fs');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_KEY);
const PdfDocument = require('pdfkit');
const Product = require('../models/product');
const Order = require('../models/order');

const ITEM_PER_PAGE = 2;

exports.getProducts =async (req, res, next) => {
  const page = +req.query.page || 1;
  const total = await Product.countDocuments();
  Product.find()
    .limit(ITEM_PER_PAGE)
    .skip((page - 1) * ITEM_PER_PAGE)
    .then(products => {
      res.render('shop/index', {
        prods: products,
        pageTitle: 'Shop',
        path: '/products',
        total,
        currentPage:page,
        hasNextPage: ITEM_PER_PAGE * page < total,
        hasPreviousPage: page > 1,
        nextPage: page + 1,
        previousPage: page - 1,
        lastPage: Math.ceil(total / ITEM_PER_PAGE)
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getProduct = (req, res, next) => {
  const prodId = req.params.productId;
  Product.findById(prodId)
    .then(product => {
      res.render('shop/product-detail', {
        product: product,
        pageTitle: product.title,
        path: '/products'
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getIndex = async (req, res, next) => {
  const page = +req.query.page || 1;
  const total = await Product.countDocuments();
  Product.find()
    .limit(ITEM_PER_PAGE)
    .skip((page - 1) * ITEM_PER_PAGE)
    .then(products => {
      res.render('shop/index', {
        prods: products,
        pageTitle: 'Shop',
        path: '/',
        total,
        currentPage:page,
        hasNextPage: ITEM_PER_PAGE * page < total,
        hasPreviousPage: page > 1,
        nextPage: page + 1,
        previousPage: page - 1,
        lastPage: Math.ceil(total / ITEM_PER_PAGE)
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getCart = (req, res, next) => {
  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then(user => {
      const products = user.cart.items;
      res.render('shop/cart', {
        path: '/cart',
        pageTitle: 'Your Cart',
        products: products
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getCheckout = (req, res, next) => {
  let products; // THIS WAS MOVED - had to put it here, to make it accessible by all then() blocks.
  let total = 0; // THIS WAS MOVED - had to put it here, to make it accessible by all then() blocks.
  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then(user => {
      products = user.cart.items;
      products.forEach(p => {
        total += p.quantity * p.productId.price;
      });
      return stripe.checkout.sessions.create({ // THIS WAS ADDED - configures a Stripe session
        payment_method_types: ['card'],
        line_items: products.map(p => {
          return {
            name: p.productId.title,
            description: p.productId.description,
            amount: p.productId.price * 100,
            currency: 'usd',
            quantity: p.quantity
          };
        }),
        success_url: 'http://localhost:3004/checkout/success', // THIS WAS ADDED
        cancel_url: 'http://localhost:3004/checkout/cancel' // THIS WAS ADDED
      });
    })
    .then(session => {
      console.log(session);
      res.render('shop/checkout', {
        path: '/checkout',
        pageTitle: 'Checkout',
        products: products,
        totalSum: total,
        sessionId: session.id // THIS WAS ADDED - we need that in the checkout.ejs file (see above)
      });
    })
    .catch(err => {
      console.log(err)
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postCart = (req, res, next) => {
  const prodId = req.body.productId;
  Product.findById(prodId)
    .then(product => {
      return req.user.addToCart(product);
    })
    .then(result => {
      console.log(result);
      res.redirect('/cart');
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postCartDeleteProduct = (req, res, next) => {
  const prodId = req.body.productId;
  req.user
    .removeFromCart(prodId)
    .then(result => {
      res.redirect('/cart');
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postOrder = (req, res, next) => {
  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then(user => {
      const products = user.cart.items.map(i => {
        return { quantity: i.quantity, product: { ...i.productId._doc } };
      });
      const order = new Order({
        user: {
          email: req.user.email,
          userId: req.user
        },
        products: products
      });
      return order.save();
    })
    .then(result => {
      return req.user.clearCart();
    })
    .then(() => {
      res.redirect('/orders');
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getOrders = (req, res, next) => {
  Order.find({ 'user.userId': req.user._id })
    .then(orders => {
      res.render('shop/orders', {
        path: '/orders',
        pageTitle: 'Your Orders',
        orders: orders
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getInvoice = (req, res, next) => {
  const orderId = req.params.orderId;
  Order.findOne({ _id: orderId }).then(order => {
    if (order) {
      if (order.user.userId.toString() !== req.user._id.toString())
        return next(new Error("You are not allowed to download this order."));
      const invoiceName = 'invoice-' + orderId + '.pdf';
      const invoicePath = path.join('data', 'invoices', invoiceName);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline;filename="' + invoiceName + '"');

      // fs.readFile(invoicePath, (err, data) => {
      //   if (err)
      //     return next(err);
      //   // res.setHeader('Content-Disposition', 'attachment;filename="' + invoiceName + '"');
      //   res.send(data);
      // })
      // const file = fs.createReadStream(invoicePath);
      // file.pipe(res);

      const pdfFile = new PdfDocument();
      pdfFile.pipe(fs.createWriteStream(invoicePath));
      pdfFile.pipe(res);
      pdfFile.fontSize(26).text('Invoice', { underline: true });
      pdfFile.fontSize(14);
      pdfFile.text('-----------------------------');

      let total = 0.0;
      order.products.forEach(element => {
        total += element.quantity * element.product.price;
        pdfFile.text(element.product.title + ' - ' + element.quantity + ' x ' + '$' + element.product.price);
      });
      pdfFile.text('-------------------------');
      pdfFile.fontSize(20).text('Total: $' + total.toFixed(2));
      pdfFile.end();
    } else
      return next(new Error("Order not found."))
  }).catch(err => {
    return next(err)
  });

}

exports.getCheckoutSuccess = (req, res, next) => {
  console.log('SUCCESS');
  let totalSum = 0;
  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then(user => {
      user.cart.items.forEach(p => {
        totalSum += p.quantity * p.productId.price;
      });
 
      const products = user.cart.items.map(i => {
        return { quantity: i.quantity, product: { ...i.productId._doc } };
      });
      const order = new Order({
        user: {
          email: req.user.email,
          userId: req.user
        },
        products: products
      });
      return order.save();
    })
    .then(() => {
      return req.user.clearCart();
    })
    .then(() => {
      res.redirect('/orders');
    })
    .catch(err => {
      const error = new Error(err);
      console.log(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};