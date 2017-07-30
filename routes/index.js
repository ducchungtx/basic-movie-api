var CrawlerFunc =require("./function");
var express = require('express');

var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
    CrawlerFunc.crawlerUrl((postContent) => {
        res.json({movies: postContent})
    });
});

module.exports = router;
