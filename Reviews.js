var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var Movie = require('./Movies.js');

let ReviewSchema = new Schema({
    Movie: {type: String, required: true},
    Reviewer: {type: String, required: true},
    Rating: {type: Number, required: true},
    Blurb: String
});

ReviewSchema.pre('save', function(next) {
    Movie.findOne({Title: this.Movie})
        .select('Title')
        .exec((err, movie) =>{
            if(err){
                return next({code: 500, message: err.message});
            }
            else if(!movie){
                return next({code: 400, message: "a movie must exist with the Title listed in the review's Movie field."})
            }
            else
                return next();
        })
})

module.exports = mongoose.model('Review', ReviewSchema);