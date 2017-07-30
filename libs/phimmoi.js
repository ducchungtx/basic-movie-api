let cheerio = require("cheerio");
let request = require('request');
let rq = require("request-promise");
let async = require("async");
let _ = require("lodash");
let CryptoJS = require("crypto-js");

class Phimmoi {
    constructor() {
        this.baseUrl = "http://www.phimmoi.net/";
        this.requestOption = {
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/57.0.2987.133 Safari/537.36',
                'referer': 'http://www.phimmoi.net/',
                'cookie': '_a3rd1478681532=0-9; ADB3rdCookie1478681307=1; ADB3rdCookie1413887770=1; _a3rd1407405582=0-8; ADB3rdCookie1385973822=1; gen_crtg_rta=; __RC=5; __R=3; __UF=-1; __uif=__uid%3A2625795562883732188%7C__ui%3A-1%7C__create%3A1482579556; __tb=0; __IP=2883739208; __utmt=1; __utmt_b=1; __utma=247746630.1273382115.1482841916.1484328884.1484382954.4; __utmb=247746630.3.10.1484382954; __utmc=247746630; __utmz=247746630.1482841916.1.1.utmcsr=(direct)|utmccn=(direct)|utmcmd=(none); _a3rd1426850317=0-5; _a3rd1401790478=0-6'
            },
            timeout: 30000,
            retries: 5
        };
        this.phimle = "http://www.phimmoi.net/phim-le/"
    }

    crawlPhimMoi(callback) {
        request(this.baseUrl, this.requestOption, (err, res, html) => {
            if (!err && res.statusCode === 200) {
                let $ = cheerio.load(html);
                let listMovies = $('.movie-list-index .movie-item');
                let MovieLinks = [];
                async.waterfall([
                    /**
                    * Get Movie Links
                    * @param cb
                    */
                    (cb) => {
                        let count = 0;
                        _.each(listMovies, async (movieItem) => {
                            try {
                                console.log(movieItem.attribs.href);
                                let movieData = await this.crawlDetailMovie(movieItem.attribs.href);
                                Object.assign(movieData, { link: movieItem.attribs.href });
                                MovieLinks.push(movieData);
                                if (count === listMovies.length - 1) {
                                    cb(null, MovieLinks);
                                }
                                count++;
                            } catch (e) {
                                cb(e);
                            }
                        });
                    }
                ], (err, MovieLinks) => {
                    if (!err) {
                        this.getMediaUrl(MovieLinks, (movies) => {
                            callback(movies);
                        });
                    } else {
                        console.log(err);
                        callback({})
                    }
                });
            } else {
                console.log(err);
                callback({});
            }
        })
    }

    /**
    * Crawl Movie Detail
    * @param url
    * @returns {Promise}
    */
    crawlDetailMovie(url) {
        return new Promise((resolve, reject) => {
            request(`${this.baseUrl}${url}`, this.requestOption, (err, res, html) => {
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
                    let movieData = {
                        title: movieTitle,
                        image: movieImage,
                        imdb: movieImdb,
                        duration,
                        category,
                        description,
                        pubDate,
                        numberOfEp,
                        year
                    };
                    resolve(movieData);
                } else {
                    if (err) {
                        reject(err);
                    }
                    else {
                        reject(res);
                    }

                }
            });
        });
    }

    async crawlMediaSource(url) {
        try {
            url = url.replace('http://www.phimmoi.net/', "");
            let getMediaUrl = await this.findMediaServer(url);
            let sources = await this.getMediaSource(getMediaUrl, []);
            return sources;
        } catch (e) {
            console.log("Error - CrawlMediaSource");
            console.log(e);
        }
    }

    async crawlMediaUrl(url) {
        try {
            let getMediaUrl = await this.findMediaServer(url),
                movie = await this.getMediaUrls(getMediaUrl, {});
            return movie;
        } catch (e) {
            console.log("Error at getMovieEp ", e)
        }
    }

    /**
    * Get Episode Movies
    * @param serverEpisode
    * @returns {Promise.<Array>}
    */
    async getMovieEp(serverEpisode) {
        try {
            let episodes = [];
            for (let server of serverEpisode) {
                let episode = { epUrls: [] };
                episode.title = server.title;
                for (let ep of server.listEp) {
                    episode.epUrls.push({ name: ep.title, mediaUrls: encodeURIComponent(ep.url) });
                }
                episodes.push(episode);
            }
            return episodes;
        } catch (err) {
            console.log("Error at getMovieEp ", err);
        }
    }

    async crawlFromUrl(url) {
        try {
            url = decodeURIComponent(url).replace('http://www.phimmoi.net/', "");
            url = url.replace("xem-phim.html", "");
            let movie = {};
            let movieData = await this.crawlDetailMovie(url);
            Object.assign(movieData, { link: url });
            let serverEpisode = await this.getServerEpisode(url);
            if (serverEpisode.length) {
                let movieEpisodes = await this.getMovieEp(serverEpisode);
                movie = movieData;
                movie.movieEpisodes = movieEpisodes;
            } else {
                let getMediaUrl = await this.findMedia(url);
                movie = await this.getMediaUrls(getMediaUrl, movieData);
            }
            return movie;
        } catch (err) {
            console.log("Error at crawlFromUrl ", err);
        }
    }

    getServerEpisode(url) {
        return new Promise((resolve, reject) => {
            request(`${this.baseUrl}${url}xem-phim.html`, this.requestOption, (err, res, html) => {
                if (!err && res.statusCode === 200) {
                    try {
                        let $ = cheerio.load(html),
                            serverEpisodeOutput = [];
                        /**
                        *  Movie
                        */
                        let list_server = $(".list-server .server .server-list");
                        if (list_server.length) {
                            _.each(list_server, (server) => {
                                let list_episode = server.children.reduce((episodes, item) => {
                                    let list_server_item = {};
                                    _.each(item.children, (nodeDetail) => {
                                        if (nodeDetail.name === "h3") {
                                            list_server_item.title = nodeDetail.children[0].data;
                                        }
                                        if (nodeDetail.attribs.class === "list-episode") {
                                            list_server_item.listEp = nodeDetail.children.reduce((listUrl, nodeDetail) => {
                                                try {
                                                    let name = nodeDetail.children[0].children[0].data,
                                                        url = nodeDetail.children[0].attribs.href;
                                                    listUrl.push({ title: name, url });
                                                    return listUrl;
                                                } catch (err) {
                                                    console.log(err);
                                                }
                                            }, []);
                                        }
                                    });
                                    episodes.push(list_server_item);
                                    return episodes;
                                }, []);
                                serverEpisodeOutput = serverEpisodeOutput.concat(list_episode);
                            })
                        } else {
                            /**
                             * Movie With Episodes
                             * @type {*}
                             */
                            list_server = $(".list-server");
                            _.each(list_server, (server) => {
                                let list_episode = server.children.reduce((episodes, item) => {
                                    let list_server_item = {};
                                    _.each(item.children, (nodeDetail) => {
                                        if (nodeDetail.name === "h3") {
                                            list_server_item.title = nodeDetail.children[0].data;
                                        }
                                        if (nodeDetail.attribs.class === "list-episode") {
                                            list_server_item.listEp = nodeDetail.children.reduce((listUrl, nodeDetail) => {
                                                try {
                                                    let name = nodeDetail.children[0].children[0].data,
                                                        url = nodeDetail.children[0].attribs.href;
                                                    listUrl.push({ title: name, url });
                                                    return listUrl;
                                                } catch (err) {
                                                    console.log(err);
                                                }
                                            }, []);
                                        }
                                    });
                                    episodes.push(list_server_item);
                                    return episodes;
                                }, []);
                                serverEpisodeOutput = serverEpisodeOutput.concat(list_episode);
                            })
                        }
                        resolve(serverEpisodeOutput);
                    } catch (e) {
                        console.log(e);
                        reject({ err: { message: "Error at getServerEpisode" } })
                    }
                } else {
                    console.log(err);
                    reject({ err: { message: "Error at getServerEpisode" } })
                }
            })
        })
    }

    getMediaSource(media, movie) {
        return new Promise((resolve, reject) => {
            request(media, this.requestOption, (err, res, jsonString) => {
                if (!err && res.statusCode === 200) {
                    let body = JSON.parse(jsonString);
                    let password = "PhimMoi.Net@" + body.episodeId;
                    let mediaItems = [];
                    _.each(body.medias, (media) => {
                        let mediaItem = {
                            type: media.type,
                            label: media.resolution,
                            src: this.decodeAES(media.url, password)
                        };
                        mediaItems.push(mediaItem);
                    });
                    movie = movie.concat(mediaItems);
                    resolve(movie);
                } else {
                    console.log(err);
                    reject({ err: err });
                }
            })
        })
    }

    getMediaUrls(media, movie) {
        return new Promise((resolve, reject) => {
            request(media, this.requestOption, (err, res, jsonString) => {
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
                            url: this.decodeAES(media.url, password)
                        };
                        mediaItems.push(mediaItem);
                    });
                    Object.assign(movie, { mediaUrls: mediaItems });
                    resolve(movie);
                } else {
                    console.log(err);
                    reject({ err: err });
                }
            })
        })
    }

    getMediaUrl(listUrl, callback) {
        var count = 0;
        _.each(listUrl, (movie) => {
            this.findMedia(movie.link).then((getMedia) => {
                request(getMedia, this.requestOption, (err, res, jsonString) => {
                    if (!err && res.statusCode === 200) {
                        let body = JSON.parse(jsonString);
                        let password = "PhimMoi.Net@" + body.episodeId;
                        let mediaItems = [];
                        setTimeout(() => {
                            _.each(body.medias, (media) => {
                                let mediaItem = {
                                    type: media.type,
                                    width: media.width,
                                    height: media.height,
                                    resolution: media.resolution,
                                    url: this.decodeAES(media.url, password)
                                };
                                mediaItems.push(mediaItem);
                            });
                            let currentMovieIndex = _.indexOf(listUrl, movie);
                            Object.assign(movie, { mediaUrls: mediaItems });
                            listUrl.splice(currentMovieIndex, 1, movie);
                            if (count === listUrl.length - 1) {
                                callback(listUrl);
                            }
                            count++;
                        }, 500);
                    } else {
                        console.log(err);
                        callback({ err: err });
                    }
                })
            }).catch(err => {
                console.log(err);
            })
        })
    }



    findMedia(url) {
        return new Promise((resolve, reject) => {
            request(`${this.baseUrl}${url}xem-phim.html`, this.requestOption, (err, res, html) => {
                if (!err && res.statusCode === 200) {
                    try {
                        let $ = cheerio.load(html);
                        let media = $('script[onload="checkEpisodeInfoLoaded(this)"]').attr("src");
                        if (media != undefined) {
                            console.log(`Getting PhimMoi Media: \n ${media} \n\n`, ' ');
                            resolve(media.replace("javascript", "json"));
                        } else {
                            reject(new Error("No Media Found"));
                        }
                    } catch (e) {
                        console.log("Catch Error: ", e);
                        reject({ err: err });
                    }
                } else {
                    if (err) {
                        console.log("Get Error: ", err);
                        reject({ err: err });
                    } else {
                        console.log("Get Res: ", res);
                        reject({ err: { message: "Error" } });
                    }
                }
            });
        })
    };

    findMediaServer(url) {
        return new Promise((resolve, reject) => {
            request(`${this.baseUrl}${url}`, this.requestOption, (err, res, html) => {
                if (!err && res.statusCode === 200) {
                    try {
                        let $ = cheerio.load(html);
                        let media = $('script[onload="checkEpisodeInfoLoaded(this)"]').attr("src");
                        if (media != undefined) {
                            console.log(`Getting PhimMoi Media: \n ${media} \n\n`, ' ');
                            resolve(media.replace("javascript", "json"));
                        } else {
                            reject(new Error("No Media Found"))
                        }
                    } catch (e) {
                        console.log("Catch Error: ", e);
                        reject({ err: err });
                    }
                } else {
                    if (err) {
                        console.log("Get Error: ", err);
                        reject({ err: err });
                    } else {
                        console.log("Get Res: ", res);
                        reject({ err: { message: "Error" } });
                    }
                }
            });
        })
    };

    decodeAES(url, password) {
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

    getStreamLink(url) {
        return new Promise((resolve, reject) => {
            request(url, this.requestOption, (err, res, body) => {
                if (err) {
                    console.log(err);
                    reject(err);
                } else {
                    console.log(res.headers);
                    resolve({ response: res, body });
                }
            })
        })
    }
    /*
    * Lấy danh sách thể loại
    */
    async crawlPhimMoiTheLoai(url) {        
        try {            
            request(url, this.requestOption, (err, res, html) => {
                let MovieLinks = [{}];
                if (!err && res.statusCode === 200) {
                    request(url, this.requestOption, (err, res, html) => {
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
                            let mData = {
                                name: movieName,
                                link: movieLink,
                                image: movieImage
                            };
                            MovieLinks.push(mData);
                        });
                    });
                } else {
                    console.log('err');
                }
            });            
            return MovieLinks;
        } catch (err) {
            console.log("Error at crawlFromUrl ", err);
        }
    }
}

module.exports = Phimmoi;

//console.log(movieItem.parent.attribs.href);