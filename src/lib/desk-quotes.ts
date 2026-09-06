/**
 * The word of the day. One football quotation per calendar day, the same one
 * for every manager who opens the Ledger that day, so the league argues about
 * the same line. Picked from the date alone — no storage, no network — and
 * spread across the list so two coaches rarely run back to back.
 */

export interface Quote {
  text: string
  by: string
}

export const QUOTES: Quote[] = [
  { text: 'Winning is a habit. Unfortunately, so is losing.', by: 'Vince Lombardi' },
  { text: 'Just win, baby.', by: 'Al Davis' },
  { text: 'You play to win the game.', by: 'Herm Edwards' },
  { text: 'Do your job.', by: 'Bill Belichick' },
  { text: 'Offense sells tickets. Defense wins championships.', by: 'Bear Bryant' },
  { text: 'They are who we thought they were.', by: 'Dennis Green' },
  { text: 'Playoffs? Don’t talk about playoffs. You kidding me? Playoffs?', by: 'Jim Mora' },
  { text: 'I never lost a game in my life. Once in a while, time ran out on me.', by: 'Bobby Layne' },
  { text: 'We’re on to Cincinnati.', by: 'Bill Belichick' },
  { text: 'You are what your record says you are.', by: 'Bill Parcells' },
  { text: 'Football is a game of inches, and inches make the champion.', by: 'Vince Lombardi' },
  { text: 'Pressure is something you feel when you don’t know what the hell you’re doing.', by: 'Chuck Noll' },
  { text: 'If they want you to cook the dinner, at least they ought to let you shop for some of the groceries.', by: 'Bill Parcells' },
  { text: 'Stats are for losers. The final score is for winners.', by: 'Bill Belichick' },
  { text: 'When you win, say nothing. When you lose, say less.', by: 'Paul Brown' },
  { text: 'Champions behave like champions before they’re champions.', by: 'Bill Walsh' },
  { text: 'I’m just here so I won’t get fined.', by: 'Marshawn Lynch' },
  { text: 'Never die easy. Why run out of bounds and die easy? Make that linebacker pay.', by: 'Walter Payton' },
  { text: 'Perfection is not attainable, but if we chase perfection we can catch excellence.', by: 'Vince Lombardi' },
  { text: 'Blame nobody. Expect nothing. Do something.', by: 'Bill Parcells' },
  { text: 'If a man watches three football games in a row, he should be declared legally dead.', by: 'Erma Bombeck' },
  { text: 'It’s not the will to win that matters — everyone has that. It’s the will to prepare to win that matters.', by: 'Bear Bryant' },
  { text: 'Nobody who ever gave his best regretted it.', by: 'George Halas' },
  { text: 'We’re going to win Sunday. I guarantee it.', by: 'Joe Namath' },
  { text: 'Talent sets the floor. Character sets the ceiling.', by: 'Bill Belichick' },
  { text: 'Football is a game of errors. The team that makes the fewest errors in a game usually wins.', by: 'Paul Brown' },
  { text: 'Football combines the two worst things about America: it is violence punctuated by committee meetings.', by: 'George Will' },
  { text: 'If you look good, you feel good. If you feel good, you play good. If you play good, they pay good.', by: 'Deion Sanders' },
  { text: 'Fatigue makes cowards of us all.', by: 'Vince Lombardi' },
  { text: 'You’re never a loser until you quit trying.', by: 'Mike Ditka' },
  { text: 'Don’t worry about the horse being blind, just load the wagon.', by: 'John Madden' },
  { text: 'Football is not a contact sport. It’s a collision sport. Dancing is a contact sport.', by: 'Duffy Daugherty' },
  { text: 'The man who complains about the way the ball bounces is likely the one who dropped it.', by: 'Lou Holtz' },
  { text: 'Losing has nothing to do with geography.', by: 'Chuck Noll' },
  { text: 'If you want to win, do the ordinary things better than anyone else does them, day in and day out.', by: 'Chuck Noll' },
  { text: 'Show class, have pride, and display character. If you do, winning takes care of itself.', by: 'Bear Bryant' },
  { text: 'No matter how many championships you’ve won, you’re not winning now, so you stink.', by: 'Bill Parcells' },
  { text: 'A tie is like kissing your sister.', by: 'Duffy Daugherty' },
  { text: 'Pro football is like nuclear warfare. There are no winners, only survivors.', by: 'Frank Gifford' },
  { text: 'The road to Easy Street goes through the sewer.', by: 'John Madden' },
  { text: 'Confidence is contagious. So is lack of confidence.', by: 'Vince Lombardi' },
  { text: 'Effort without talent is a depressing situation, but talent without effort is a tragedy.', by: 'Mike Ditka' },
  { text: 'Dumb players do dumb things. Smart players very seldom do dumb things.', by: 'Bill Parcells' },
  { text: 'Never quit. It is the easiest cop-out in the world.', by: 'Bear Bryant' },
  { text: 'Football is a game designed to keep coal miners off the streets.', by: 'Jimmy Breslin' },
  { text: 'When you’re good at something, you’ll tell everyone. When you’re great at something, they’ll tell you.', by: 'Walter Payton' },
  { text: 'Success isn’t owned. It’s leased, and rent is due every day.', by: 'J.J. Watt' },
  { text: 'Football is a game played with arms, legs and shoulders, but mostly from the neck up.', by: 'Knute Rockne' },
  { text: 'Today, you have 100 percent of your life left.', by: 'Tom Landry' },
  { text: 'Once you learn to quit, it becomes a habit.', by: 'Vince Lombardi' },
  { text: 'Leaving the game plan is a sign of panic, and panic is not in our game plan.', by: 'Chuck Noll' },
  { text: 'Football doesn’t build character. It eliminates the weak ones.', by: 'Darrell Royal' },
  { text: 'Three things can happen when you pass, and two of them are bad.', by: 'Darrell Royal' },
  { text: 'Winning isn’t everything, but it beats anything that comes in second.', by: 'Bear Bryant' },
  { text: 'Clear eyes, full hearts, can’t lose.', by: 'Eric Taylor, Dillon Panthers' },
  { text: 'The inches we need are everywhere around us.', by: 'Tony D’Amato, Any Given Sunday' },
  { text: 'You can learn a line from a win and a book from a defeat.', by: 'Paul Brown' },
  { text: 'Setting a goal is not the main thing. It is deciding how you will go about achieving it and staying with that plan.', by: 'Tom Landry' },
  { text: 'Show me a good and gracious loser and I’ll show you a failure.', by: 'Knute Rockne' },
  { text: 'It’s not whether you get knocked down; it’s whether you get up.', by: 'Vince Lombardi' },
  { text: 'Power wins football games.', by: 'Bill Parcells' },
  { text: 'Life is ten percent what happens to you and ninety percent how you respond to it.', by: 'Lou Holtz' },
  { text: 'If you aren’t going all the way, why go at all?', by: 'Joe Namath' },
  { text: 'Little things make the difference. Everyone is well prepared in the big things, but only the winners perfect the little things.', by: 'Bear Bryant' },
  { text: 'Mental toughness is doing the right thing for the team when it’s not the best thing for you.', by: 'Bill Belichick' },
  { text: 'When you want to win a game, you have to teach. When you lose a game, you have to learn.', by: 'Tom Landry' },
  { text: 'The only yardstick for success our society has is being a champion. No one remembers anything else.', by: 'John Madden' },
  { text: 'Never go to bed a loser.', by: 'George Halas' },
  { text: 'Practice does not make perfect. Only perfect practice makes perfect.', by: 'Vince Lombardi' },
  { text: 'Concentrate on the process rather than the prize. The score takes care of itself.', by: 'Bill Walsh' },
  { text: 'Baseball is what we were. Football is what we have become.', by: 'Mary McGrory' },
  { text: 'There’s a lot of blood, sweat and guts between dreams and success.', by: 'Bear Bryant' },
  { text: 'Before you can win, you have to believe you are worthy.', by: 'Mike Ditka' },
  { text: 'Build up your weaknesses until they become your strong points.', by: 'Knute Rockne' },
  { text: 'Most football players are temperamental. That’s 90 percent temper and 10 percent mental.', by: 'Doug Plank' },
  { text: 'Some people try to find things in this game that don’t exist. Football is only two things: blocking and tackling.', by: 'Vince Lombardi' },
  { text: 'Coaches have to watch for what they don’t want to see and listen to what they don’t want to hear.', by: 'John Madden' },
  { text: 'Leadership is a matter of having people look at you and gain confidence. If you’re in control, they’re in control.', by: 'Tom Landry' },
  { text: 'In a crisis, don’t hide behind anything or anybody. They’re going to find you anyway.', by: 'Bear Bryant' },
  { text: 'It’s not about collecting talent. It’s about building a team.', by: 'Bill Belichick' },
  { text: 'I’ve learned that something constructive comes from every defeat.', by: 'Tom Landry' },
  { text: 'Football is, after all, a wonderful way to get rid of your aggressions without going to jail for it.', by: 'Heywood Hale Broun' },
  { text: 'Don’t give up at halftime. Concentrate on winning the second half.', by: 'Bear Bryant' },
  { text: 'When you make a mistake, there are only three things to do about it: admit it, learn from it, and don’t repeat it.', by: 'Bear Bryant' },
  { text: 'The harder you work, the harder it is to surrender.', by: 'Vince Lombardi' },
  { text: 'Football is an incredible game. Sometimes it’s so incredible, it’s unbelievable.', by: 'Tom Landry' },
  { text: 'I ain’t never been nothing but a winner.', by: 'Bear Bryant' },
  { text: 'Gentlemen, this is a football.', by: 'Vince Lombardi' },
  { text: 'Winning isn’t everything. It’s the only thing.', by: 'Red Sanders, by way of Vince Lombardi' },
]

/** Days since the epoch for a local calendar date — the key that picks the quote. */
export function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
}

/**
 * The quote for a date. A stride coprime to the list length walks every
 * quote once per cycle without marching through the list in order.
 */
export function quoteFor(date: Date, quotes: Quote[] = QUOTES): Quote {
  const n = quotes.length
  const stride = strideFor(n)
  return quotes[((dayNumber(date) * stride) % n + n) % n]
}

function strideFor(n: number): number {
  for (const candidate of [37, 31, 29, 23, 19, 17, 13, 11, 7, 5, 3]) {
    if (candidate < n && gcd(candidate, n) === 1) return candidate
  }
  return 1
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}
