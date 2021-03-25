var mongoose = require('mongoose');
var Schema = mongoose.Schema;

let MovieSchema = new Schema( {
    Title: {type: String, required: true, index: {unique: true, dropDups: true}},
    Year: Number,
    Genre: String,
    LeadActors:[
        {
            ActorName: String,
            CharacterName: String
        },
        {
            ActorName: String,
            CharacterName: String
        },
        {
            ActorName: String,
            CharacterName: String
        }
    ]
})

MovieSchema.pre('save', function(next){
    var movie = this;
    // Error check user input
    // Valid year, genre, and correct num of actors.
    const yearOfFirstFilmMovie = 1888;
    let date = new Date();

    if(this.Year > date.getFullYear() || this.Year < yearOfFirstFilmMovie){
        return next({code: 400, message: "Year cannot be in the future or before first known film in history (1888)"})
    }
    let genres = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mystery", "Thriller", "Western"];
    if(!genres.includes(this.Genre)){
        return next({code: 400, message: "Genre must belong to a valid genre."});
    }
    if(this.LeadActors.length < 3){
        return next({code: 400, message: "Actors must contain 3 actors that were in the movie."});
    }

    // Otherwise the movie is good to go.
    next();
});

//return the model to the server
module.exports = mongoose.model('Movie', MovieSchema);