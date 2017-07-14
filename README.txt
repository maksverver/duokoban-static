To install node_modules:

  npm install

To run locally:

  # Note: this uses the production database!
  export DATABASE_URL=$(heroku config:get DATABASE_URL)?ssl=true
  node server.js
