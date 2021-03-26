/*
CSC3916 HW3
File: Server.js
Description: Web API scaffolding for Movie API
 */

var express = require('express');
var bodyParser = require('body-parser');
var passport = require('passport');
var authJwtController = require('./auth_jwt');
var jwt = require('jsonwebtoken');
var cors = require('cors');
var User = require('./Users');
var Movie = require('./Movies')
var Review = require('./Reviews')
var app = express();
var ObjectId = require('mongoose').Types.ObjectId;
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(passport.initialize());

var router = express.Router();

const SUPPORTED_VERSIONS = [1];
const VERSION_DENY_MESSAGE = "This server supports API versions: { 1 }. Version must be specified in HTTP headers under 'api_version'"
const DEFAULT_NUM_RETURNED = 10;
const DEFAULT_OFFSET = 0;

router.post('/signup', function(req, res) {
    if(!SUPPORTED_VERSIONS.includes(parseInt(req.headers.api_version))) {
        res.statusCode = 400;
        return res.json({message: VERSION_DENY_MESSAGE});
    }

    if (!req.body.username || !req.body.password) {
        res.json({success: false, msg: 'Please include both username and password to signup.'})
    } else {
        var user = new User();
        user.name = req.body.name;
        user.username = req.body.username;
        user.password = req.body.password;

        user.save(function(err){
            if (err) {
                if (err.code === 11000){
                    res.statusCode = 409;
                    return res.json({success: false, message: 'A user with that username already exists.'});
                }
                else {
                    console.log(err.message); //probably don't want to expose login related server errors to user but we want to log them for our own use
                    res.statusCode = 500;
                    return res.json({success: false, message: "Internal server error."});
                }
            }
            res.json({success: true, msg: 'Successfully created new user.'})
        });
    }
});

router.post('/signin', function (req, res) {
    if(!SUPPORTED_VERSIONS.includes(parseInt(req.headers.api_version))) {
        res.statusCode = 400;
        return res.json({message: VERSION_DENY_MESSAGE});
    }
    var userNew = new User();
    userNew.username = req.body.username;
    userNew.password = req.body.password;

    User.findOne({ username: userNew.username }).select('name username password').exec(function(err, user) {
        if (err) {
            res.send(err);
        }

        user.comparePassword(userNew.password, function(isMatch) {
            if (isMatch) {
                var userToken = { id: user.id, username: user.username };
                var token = jwt.sign(userToken, process.env.SECRET_KEY);
                res.json ({success: true, token: 'JWT ' + token});
            }
            else {
                res.status(401).send({success: false, msg: 'Authentication failed.'});
            }
        })
    })
});

router.route('/movies/:Title?')
    .post(authJwtController.isAuthenticated, function(req, res){
        if(!SUPPORTED_VERSIONS.includes(parseInt(req.headers.api_version))) {
            res.statusCode = 400;
            return res.json({message: VERSION_DENY_MESSAGE});
        }
        if(!req.params.Title){
            res.statusCode = 404;
            return res.json({success: false, message: "Creating a movie must be done at path /movies/MovieName"})
        }
        if(!req.body.Year || !req.body.Genre || !req.body.LeadActors){
            res.statusCode = 400;
            return res.json({success: false, message: "Creating a movie requires Year, Genre, and 3 LeadActors in body."})
        }
        let movie = new Movie();
        movie.Title = req.params.Title;
        movie.Year = req.body.Year;
        movie.Genre = req.body.Genre;
        movie.LeadActors = req.body.LeadActors;

        movie.save((err) => {
            if(err){
                if(err.code === 11000) {
                    res.statusCode = 409;
                    return res.json({success: false, message: "a movie already exists with that title"})
                }
                else{
                    res.statusCode = 500;
                    return res.json({success: false, message: err.message});
                }
            }
            else{
                return res.json({success: true, message: "movie created in db."})
            }
        })
    })
    .get(authJwtController.isAuthenticated, function(req, res){
        if(!SUPPORTED_VERSIONS.includes(parseInt(req.headers.api_version))) {
            res.statusCode = 400;
            return res.json({message: VERSION_DENY_MESSAGE});
        }
        let limit = (req.query.limit &&
                    req.query.limit > 0) ? parseInt(req.query.limit) : DEFAULT_NUM_RETURNED;
        let offset = (req.query.offset &&
                    req.query.offset >= 0) ? parseInt(req.query.offset) : DEFAULT_OFFSET;
        let reviews = (req.query.reviews === "true" || req.query.reviews === true)
        let filters = extractFiltersFromRequest(req);

        if(!reviews) { //don't need to retrieve related reviews, no aggregation necessary
            Movie.find(filters)
                .skip(offset)
                .limit(limit)
                .select('Title Year Genre LeadActors')
                .exec((err, movies) => {
                    if (err) {
                        res.statusCode = 500;
                        return res.json(err.message);
                    }
                    else if(movies.length === 0 && req.params.Title){
                        res.statusCode = 404;
                        return res.json({success: false, message: "a movie does not exist with that title"})
                    }
                    else{
                        res.statusCode = 200;
                        return res.json({success: true, results: movies});
                    }
                })
        }
        else{ //join movie with reviews with a lookup and return to requester
            Movie.aggregate([
                {$match: filters},
                {$skip: offset},
                {$limit: limit},
                {$lookup: {
                    from: "reviews",
                    localField: "Title",
                    foreignField: "Movie",
                    as: "reviews"
                }},
                {$project: {
                    "reviews.Movie": 0,
                    "reviews.__v": 0,
                    "reviews._id": 0,
                    "__v": 0
                }}
            ])
            .exec((err, movies) => {
                if(err){
                    res.statusCode = 500;
                    return res.json(err.message);
                }
                else{
                    res.statusCode = 200;
                    return res.json({success: true, results: movies});
                }
            });
        }
    })

    .put(authJwtController.isAuthenticated, function(req, res) {
        if(!SUPPORTED_VERSIONS.includes(parseInt(req.headers.api_version))) {
            res.statusCode = 400;
            return res.json({message: VERSION_DENY_MESSAGE});
        }
        if(!req.body.FieldToUpdate || !req.body.NewValue){
            res.statusCode = 400;
            return res.json({success: false, message: "PUT should have 'Title', 'FieldToUpdate', and 'NewValue' fields in body."});
        }

        let filters = extractFiltersFromRequest(req);

        Movie.find(filters)
            .select('Title Year Genre LeadActors')
            .exec((err, movies) => {
            if(err){
                if (err.code === 400){ //something was wrong with the provided data.
                    res.statusCode = 400;
                    return res.json({success: false, error: err.message})
                }
                else{ //probably a server error
                    console.log(err.message);
                    res.statusCode = 500;
                    return res.json({success: false, message: "Internal server error."});
                }
            }
            if(movies.length === 0){
                res.statusCode = 404;
                return res.json({success: false, message: "A movie doesn't exist with your parameters."})
            }
            else{
                if(!movies[0][req.body.FieldToUpdate]){
                    res.statusCode = 400;
                    return res.json({success: false, message: "Provided field to update does not exist."})
                }
                if(typeof req.body.NewValue !== typeof movies[0][req.body.FieldToUpdate]){
                    res.statusCode = 400;
                    return res.json({success: false, message: "Type of new value must match type of old value."})
                }
                try {
                    movies.forEach(element => {
                        element[req.body.FieldToUpdate] = req.body.NewValue;
                        element.save((err) => {
                            if (err)
                                throw(err)
                        })
                    })
                    res.statusCode = 200;
                    return res.json({success: true, message: "Values updated in database."});
                }
                catch(err){
                    if(err.code === 400)
                        res.statusCode = 400;
                    else
                        res.statusCode = 500;
                    return res.json({success: false, error: err.message})
                }
            }

        })
    })
    .delete(authJwtController.isAuthenticated, function(req, res){
        if(!SUPPORTED_VERSIONS.includes(parseInt(req.headers.api_version))) {
            res.statusCode = 400;
            return res.json({message: VERSION_DENY_MESSAGE});
        }

        let filters = extractFiltersFromRequest(req);

        Movie.deleteMany(filters).exec((err, result) => {
            if(err){
                    res.statusCode = 500;
                    return res.json({success: false, message: "Internal server error."});
                }
            else if(result.n === 0){
                res.statusCode = 404;
                return res.json({success: false, message: "Movie(s) couldn't be deleted, none matching your search exist in database."});
            }
            else {
                res.statusCode = 200;
                return res.json({success: true, message: "Movie(s) deleted from database."});
            }
        })
    });

router.route('/reviews/:_id?')
    .get((req, res) => {
        let limit = (req.query.limit &&
            req.query.limit > 0) ? parseInt(req.query.limit) : DEFAULT_NUM_RETURNED;
        let offset = (req.query.offset &&
            req.query.offset >= 0) ? parseInt(req.query.offset) : DEFAULT_OFFSET;
        let filters = extractFiltersFromRequest(req);

        if(req.params._id && !ObjectId.isValid(req.params._id)){
            res.statusCode = 400;
            return res.json({success: false, message: 'second level path should be a valid UUID for a review'});
        }

        Review.find(filters)
            .skip(offset)
            .limit(limit)
            .select('Movie Reviewer Rating Blurb')
            .exec((err, reviews) => {
                if(err) {
                    res.statusCode = 500;
                    return res.json(err.message);
                }
                else if(reviews.length === 0 && req.params._id){
                    res.statusCode = 404;
                    return res.json({success: false, message: "a review with that id wasn't found."})
                }
                else {
                    res.statusCode = 200;
                    return res.json({success: true, results: reviews});
                }
            })
    })
    .post(authJwtController.isAuthenticated, (req, res) => {
        if(req.params.reviewid){
            res.statusCode = 400;
            return res.json({success:false, message: "post not supported on second level path, post review to /reviews"});
        }
        if(!req.body.Movie || !req.body.Rating){
            res.statusCode = 400;
            return res.json({success: false, message: "please include both Movie that is being reviewed and Rating (1-5) in body"});
        }
        let review = new Review();
        review.Movie = req.body.Movie;
        review.Rating = req.body.Rating;
        if(req.body.Blurb)
            review.Blurb = req.body.Blurb;

        //get the name of the user to attach to the review
        let token = req.headers.authorization.split(' ');
        let token_obj = jwt.decode(token[1]); // 'JWT' @ token[0], token @ token[1]
        User.findOne({username: token_obj.username})
            .select('name')
            .exec((err, user) => {
                if(err){ //this shouldn't happen if we've already verified the jwt token, something's gone wrong.
                    return res.json({success: false, error: err});
                }
                review.Reviewer = user.name;
                if(!review.Reviewer){
                    return res.json({success: false, message: "an error occurred while associating your name with the review, please try again later"})
                }
                else{
                    review.save((err, review) => {
                        if(err){ //either the pre-save failed or something's gone very wrong
                            if(err.code === 400)
                                res.statusCode = 400;
                            else
                                res.statusCode = 500;
                            return res.json({success: false, error: err.message});
                        }
                        else {
                            return res.json({success: true, message: "review saved", id: review._id})
                        }
                    })
                }
            })
    })
    .put(authJwtController.isAuthenticated, (req, res) => {

    })
    .delete(authJwtController.isAuthenticated, (req, res) => {
        let filters = extractFiltersFromRequest(req);
        Review.deleteMany(filters)
            .exec((err, result) => {
                if(err){
                    return res.json({success: false, message: err});
                }
                else if(result.n === 0 && req.params._id){ // /reviews/somereview
                    res.statusCode = 404;
                    return res.json({success: false, message: "a review with those parameters wasn't found"})
                }
                else{
                    return res.json({success: true, message: "deleted reviews"});
                }
            })
    });

app.use('/', router);
app.listen(process.env.PORT || 8080);
module.exports = app; // for testing only

function extractFiltersFromRequest(req){
    let filters = {};
    Object.keys(req.params).forEach((key) => {
        if(req.params[key]) {
            filters[key] = req.params[key];
        }
    })
    Object.keys(req.query).forEach((key) => {
        if(req.query[key]) {
            filters[key] = req.query[key];
        }
    })

    // the below are numbers in mongo but are passed as a string in a query parameter
    // to avoid typecasting issues we will cast them here
    const numerics = ['Year', 'Rating'];
    numerics.forEach((attr) => {
        if(filters[attr])
            filters[attr] = parseInt(filters[attr]);
    })
    // the below may show up in the query string
    // however they are info relevant to the request but not to the filters
    // we never want these to show up in the final filters object
    const blacklist = ['offset', 'limit', 'reviews'];
    blacklist.forEach((attr) => {
        if(filters[attr]) {
            delete filters[attr];
        }
    })
    return filters;
}
