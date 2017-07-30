var express = require('express');
var router = express.Router();
var csrf = require('csurf');
let cheerio = require("cheerio");
let request = require('request');
var CrawlerFunc = require("./function");
let _ = require("lodash");

let requestOption = {
    headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/57.0.2987.133 Safari/537.36',
        'referer': 'http://www.phimmoi.net/',
        'cookie': '_a3rd1478681532=0-9; ADB3rdCookie1478681307=1; ADB3rdCookie1413887770=1; _a3rd1407405582=0-8; ADB3rdCookie1385973822=1; gen_crtg_rta=; __RC=5; __R=3; __UF=-1; __uif=__uid%3A2625795562883732188%7C__ui%3A-1%7C__create%3A1482579556; __tb=0; __IP=2883739208; __utmt=1; __utmt_b=1; __utma=247746630.1273382115.1482841916.1484328884.1484382954.4; __utmb=247746630.3.10.1484382954; __utmc=247746630; __utmz=247746630.1482841916.1.1.utmcsr=(direct)|utmccn=(direct)|utmcmd=(none); _a3rd1426850317=0-5; _a3rd1401790478=0-6'
    },
    timeout: 30000,
    retries: 5
};

let baseUrl = 'http://www.phimmoi.net/';
/*
* GET users listing.
* ?url=phim-le/&page=3
* http://www.phimmoi.net/phim-le/page-2.html
*/
router.get('/', function (req, res, next) {    
    res.setHeader("Content-Type", "text/html;charset=utf8");
    let MovieLinks = [];
    if (req.query.url && req.query.page) {
        let url = baseUrl + req.query.url + '/page-' + req.query.page + '.html';
        request(url, requestOption, (err, res, html) => {
            let $ = cheerio.load(html);
            let listMovies = $('.movie-item .block-wrapper');
            // console.log('listMovies', listMovies);
            let count = 0
            _.each(listMovies, async (mitem) => {
                let movieName = mitem.attribs.title;
                let movieLink = mitem.attribs.href;
                let imgTmp = mitem.children[1].attribs.style;
                imgTmp = imgTmp.match(/.*\((.*)\)/);
                let movieImage = imgTmp[1];
                let movieId = movieLink;                
                var matches = movieId.match(/.*\-(.*)\//);                
                let mData = {
                    id: matches[1],
                    name: movieName,
                    link: movieLink,
                    image: movieImage
                };
                MovieLinks.push(mData);
            });
        });
        setTimeout(() => {
            res.json({ csrfToken: req.csrfToken(), movie: MovieLinks });
        }, 3000);
    } else {
        res.json({ csrfToken: req.csrfToken(), movie: false })
    }
});

/*
* Get Movie Info by Link
* theloai/detail?url=phim/robot-dai-chien-5-chien-binh-cuoi-cung-3855/
*/
router.get('/detail', function (req, res, next) {
    let url = baseUrl + req.query.url;
    let movieD = [];
    request(url, requestOption, (err, res, html) => {
        if (!err && res.statusCode === 200) {
            let $ = cheerio.load(html);
            let movieImage = $('.movie-l-img').children("img")[0].attribs.src,
                movieTitle = $('.movie-title a.title-1').text(),
                movieImdb = $('.movie-meta-info .imdb').text(),
                duration = $(".movie-meta-info .movie-dt:contains('Thời lượng:')").next().text(),
                pubDate = $(".movie-meta-info .movie-dt:contains('Ngày ra rạp:')").next().text(),
                year = $(".movie-meta-info .movie-dt:contains('Năm:')").next().text(),
                category = $(".movie-meta-info .dd-cat").text(),
                numberOfEp = $(".movie-meta-info .movie-dt:contains('Số tập:')").next().text(),
                description = $("#film-content").text();
            let mvLink = {};
            request(`${url}xem-phim.html`, requestOption, (err, res, html) => {
                if (!err && res.statusCode === 200) {
                    try {
                        let $ = cheerio.load(html);
                        let media = $('script[onload="checkEpisodeInfoLoaded(this)"]').attr("src");
                        if (media != undefined) {
                            console.log(`Getting PhimMoi Media: \n ${media} \n\n`, '');
                            mvLink = media.replace("javascript", "json");
                            request(mvLink, requestOption, (err, res, jsonString) => {
                                if (!err && res.statusCode === 200) {
                                    let body = JSON.parse(jsonString);
                                    let password = "PhimMoi.Net@" + body.episodeId;
                                    let mediaItems = [];
                                    _.each(body.medias, (media) => {
                                        let mediaItem = {
                                            type: media.type,
                                            width: media.width,
                                            height: media.height,
                                            resolution: media.resolution,
                                            url: decodeAES(media.url, password)
                                        };
                                        mediaItems.push(mediaItem);
                                    });
                                    let movieData = {
                                        title: movieTitle,
                                        image: movieImage,
                                        imdb: movieImdb,
                                        duration,
                                        category,
                                        description,
                                        pubDate,
                                        numberOfEp,
                                        year,
                                        mvLink: mediaItems
                                    };
                                    movieD = movieData;
                                } else {
                                    console.log(err);
                                }
                            })
                        } else {
                            console.log("No Media Found");
                        }
                    } catch (e) {
                        console.log("Catch Error: ", e);
                    }
                } else {
                    console.log("No Media Found");
                }
            });

        } else {
            res.json({ movie: false });
        }
    });
    setTimeout(() => {
        res.json({ movie: movieD });
    }, 3000);
});

// Giải mã
function decodeAES(url, password) {
    try {
        if (!url.match(/[-a-zA-Z0-9@:%_\+.~#?&//=]{2,256}\.[a-z]{2,4}\b(\/[-a-zA-Z0-9@:%_\+.~#?&//=]*)?/gi)) {
            let decrytData = CryptoJS.AES.decrypt(url.toString(), password);
            return decrytData.toString(CryptoJS.enc.Utf8);
        }
        return url

    } catch (e) {
        console.log(e);
        return url;
    }
}

module.exports = router;
