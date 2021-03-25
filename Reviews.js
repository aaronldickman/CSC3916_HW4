var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var Movie = require('./Movies.js');

let ReviewSchema = new Schema({
    Movie: {type: String, required: true},
    Reviewer: {type: String, required: true},
    Rating: {type: Number, required: true},
    Blurb: String
});

ReviewSchema.pre('save', (next) => {
    next();
})

module.exports = mongoose.model('Review', ReviewSchema);