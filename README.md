# PadelRanking
A project made to keep a ranking among me and my colleagues when we play Padel.

### Dependecies
It uses a python implementation of TrueSkill (https://pypi.org/project/trueskill/, https://github.com/sublee/trueskill) for ranking points. 
It uses Twisted as a webserver, and a SQLite database to keep track of players and games.
Extra python dependencies because I am lazy: pytz, argparser

It should work with both python v2.7 and python v3.6

With no algoritm modifications I use the TrueSkill algorithm with an dynamically set alteration of the draw probability to take care of "margin of victory" for each game. I simply modify the the TrueSkill object parameters prior to each game wrt a margin of victory.

### Usage
Start the webserver ```python server.py```. Default port is 8880. See --help for more info. 
