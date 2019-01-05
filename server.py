import sys
from twisted.web.server import Site, Request
from twisted.web.resource import Resource
from twisted.web.static import File
from twisted.internet import reactor, endpoints
from twisted.python import log
import sqlite3
import json
import argparse
import datetime as dt
import pytz


parser = argparse.ArgumentParser(description='Log data from an ARITERM Biomatic 20i to a sqlite database')
parser.add_argument("-db", "--database", default="padel_ranking.db",  help="The sqlite database file (default: %(default)s)")
parser.add_argument("-p", "--port", default=8880,  type=int, help="Webserver port (default: %(default)i)")
parser.add_argument("-v", "--verbose", action='store_true',  help="verbose logging of calls")
parser.add_argument("-pwd", "--password", default="password",  help="The password for being able to remove games (default: %(default)s)")

args = parser.parse_args()

def dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d

##############################################
##### DATABASE HANDLING
##############################################
def GetNextPlayerId(conn):
    v = conn.execute('SELECT MAX(id) as ID FROM players').fetchone()
    if v == None or v['ID'] == None:
        return 1
    return v['ID'] + 1

def GetNextGameId(conn):
    v = conn.execute('SELECT MAX(id) as ID FROM games').fetchone()
    if v == None or v['ID'] == None:
        return 1
    return v['ID'] + 1

def AddGame(conn, p1, p2, p3, p4, score1, score2, americano = False):
    id1 = p1 if type(p1) is int else GetPlayerId(conn, p1)
    id2 = p2 if type(p2) is int else GetPlayerId(conn, p2)
    id3 = p3 if type(p3) is int else GetPlayerId(conn, p3)
    id4 = p4 if type(p4) is int else GetPlayerId(conn, p4)
    if id1 != None and id2 != None and id3 != None and id4 != None:  
        nextId = GetNextGameId(conn)
        time = dt.datetime.utcnow().replace(microsecond=0,tzinfo=pytz.utc).isoformat()
        conn.execute("INSERT INTO games VALUES (?,?,?,?,?,?,?,?,?)", (nextId, id1, id2, id3, id4, score1, score2, 0 if americano == False else 1, time))
        conn.commit()
        return ("Added game with id {}   {}-{}   {}".format(nextId, score1, score2, "Americano" if americano else "" ))
    return None

def DeleteGame(conn, id, pwd):
    if pwd != args.password or id < 0:
        return None
    conn.execute("DELETE FROM games WHERE id = ?", (id,))
    conn.commit()
    return "Deleted game with id {}".format(id)

def DeleteAllGames(conn):
    conn.execute("DELETE FROM games")
    conn.commit()

def IsNickUnique(conn, nick):
    val = conn.execute("SELECT * FROM players WHERE nick = ?",(nick,)).fetchone()
    if val == None:
        return True
    print("!!!! player already exists")
    print(val)
    return False

def DeletePlayer(conn, nick):
    conn.execute("DELETE FROM players WHERE nick = ?",(nick,))
    conn.commit()

def AddPlayer(conn, firstname, lastname, nick):
    if(IsNickUnique(conn, nick)):
        nextId = GetNextPlayerId(conn)
        conn.execute("INSERT INTO players VALUES (?,?,?,?)", (nextId, firstname, lastname, nick))
        conn.commit()
        return "{} {} added with nick '{}'".format(firstname, lastname, nick)
    return None

def GetPlayerId(conn, nick):
    v = conn.execute("SELECT id from players where nick = ?",(nick,)).fetchone()
    if(v == None):
        return None
    return v['id']

def GetIdPlayerNameDict(conn, showNick = True):
    vals = conn.execute("SELECT * from players").fetchall()
    rats = {}
    for p in vals:
        rats[p['id']] = p['nick'] if showNick else p['firstname'] + " " + p["lastname"]
    return rats

def GetAllPlayers(conn):
    return conn.execute("SELECT * from players").fetchall()

def GetAllGames(conn):
    return conn.execute("SELECT * from games").fetchall()

def GetAllGamesWithNames(conn):
    games = conn.execute("SELECT * from games").fetchall()
    players = GetIdPlayerNameDict(conn)
    for g in games:
        g['player1'] = players[g['player1']]
        g['player2'] = players[g['player2']]
        g['player3'] = players[g['player3']]
        g['player4'] = players[g['player4']]
    return games

#######################


##############################################
##### TRUE SKILL METHODS
##############################################
import trueskill as ts
import itertools
import math

def GetSortedRanking_(players):
    rankings = {}
    for p in players:
        rankings[p] = (ts.expose(players[p]), players[p])
    return sorted(rankings.items(), key=lambda kv : (kv[1][0],kv[0]), reverse=True)

def GetRanking(conn, players, print_ranking):
    playerNames = GetIdPlayerNameDict(conn)
    r = []

    if print_ranking:
        print("---------------------")

    prevRankingPoint = 1000000.
    pos = 1
    for p in GetSortedRanking_(players):
        name = playerNames[p[0]]
        if print_ranking:
            rankingPoint = p[1][0]
            if abs(rankingPoint - prevRankingPoint) > 1e-6:
                pos = len(r) + 1
            print("{}.\t{:10}   \t{}".format(pos, name, rankingPoint))
            prevRankingPoint = rankingPoint
        r.append((name, p[1]))
    if print_ranking:
        print("---------------------")
    return r

def win_probability(team1, team2):
    delta_mu = sum(r.mu for r in team1) - sum(r.mu for r in team2)
    sum_sigma = sum(r.sigma ** 2 for r in itertools.chain(team1, team2))
    size = len(team1) + len(team2)
    TS = ts.TrueSkill()
    denom = math.sqrt(size * (ts.BETA * ts.BETA) + sum_sigma)
    return TS.cdf(delta_mu / denom)

def _GetPlace(p1, p2):
    return 1 if p1 <= p2 else 0

def flatten(d):
    r = {}
    for e in d:
        for f in e:
            r[f] = e[f]
    return r

def PlayGame_(tSkill, team1, team2, res1, res2, americano = False):
    rating_groups = (team1, team2)
    total = float(res1 + res2)
    d = abs(res1 - res2) / total

    factor = 0.4 if americano else 0.4
    offset = 0.05 if americano else 0.1
    draw_p = offset + d * factor

    tSkill.draw_probability = draw_p

    results = [(_GetPlace(res1, res2), _GetPlace(res2, res1))]

    for r in results:
        rating_groups = tSkill.rate(rating_groups, ranks=r)
    return rating_groups

def ComputeRatings(conn, verbose):
    temp_players = GetAllPlayers(conn)

    playerNames = GetIdPlayerNameDict(conn)

    players = {}

    for p in temp_players:
        players[p['id']] = ts.Rating()
    games = GetAllGames(conn)

    tSkill = ts.TrueSkill()

    for g in games:
        p = (g['player1'], g['player2'], g['player3'], g['player4'])
        team1 = {p[0] : players[p[0]], p[1]: players[p[1]]}
        team2 = {p[2] : players[p[2]], p[3]: players[p[3]]}
        s = (g['score1'], g['score2'])
        am = g['gametype'] == 1
        newRatings = flatten(PlayGame_(tSkill, team1, team2, s[0], s[1], am))

        if verbose:
            print("({}, {})  vs ({}, {})    {}-{}   {}".format(playerNames[p[0]], playerNames[p[1]],
                                                      playerNames[p[2]], playerNames[p[3]], s[0], s[1], "Americano" if am else "" ))
        for t in newRatings:
            if verbose:
                diffMu = newRatings[t].mu - players[t].mu
                diffRank = ts.expose(newRatings[t]) - ts.expose(players[t])
                print("\t{}: mu:{}  rank:{}".format(playerNames[t], diffMu, diffRank)) 
            players[t] = newRatings[t]
    return players

#######################
####   WEBSERVER  #####
#######################
class DataFetching(Resource):
    isLeaf = True

    def __init__(self, databaseName):
        print("Open database " + databaseName)
        self.db = sqlite3.connect(databaseName)
        self.db.row_factory = dict_factory

    def __del__(self):
        self.db.close()


    def render_GET(self, request):
        if len(request.args) < 1: return
        request.responseHeaders.addRawHeader(b"content-type", b"application/json")
        request.setHeader(b'Access-Control-Allow-Origin', b'*')
        if args.verbose:
            print(request.args)
        if request.args.get(b'players') != None:
            request.setResponseCode(200)
            return json.dumps(GetAllPlayers(self.db)).encode("utf8")

        if request.args.get(b'games') != None:
            request.setResponseCode(200)
            return json.dumps(GetAllGamesWithNames(self.db)).encode("utf8")

        if request.args.get(b'rankings') != None:
            request.setResponseCode(200)
            d = []
            for r in GetRanking(self.db,ComputeRatings(self.db, False),True):
                d.append( { "Name": r[0],  "TrueSkill" : { "ranking": r[1][0], "mu": r[1][1].mu, "sigma": r[1][1].sigma}})
            return json.dumps(d).encode("utf8")
        return ""

    def render_POST(self, request):
        if request.uri == b"/data/add_player":
            inp = request.content.read()
            content = json.loads(inp.decode("utf8"))
            m = AddPlayer(self.db, content['firstname'],content['lastname'], content['nick'])
            print(m)
            if m != None:
                request.setResponseCode(200)
                return json.dumps({ "success": 1, "message": m}).encode("utf8")
            else:
                return json.dumps({"success": 0, "message": "ERROR - Nick '{}' is not unique".format(content['nick'])}).encode("utf8")

        if request.uri == b"/data/add_game":
            inp = request.content.read()
            content = json.loads(inp.decode("utf8"))
            m = AddGame(self.db,
                        content['player1'], content['player2'],
                        content['player3'], content['player4'],
                        content['score1'], content['score2'],
                        content['americano'])
            print(m)
            if m != None:
                request.setResponseCode(200)
                return json.dumps({ "success": 1, "message": m}).encode("utf8")
            else:
                return json.dumps({"success": 0, "message": "Could not add game - Players not unique"}).encode("utf8")

        if request.uri == b"/data/delete_game":
            inp = request.content.read()
            content = json.loads(inp.decode("utf8"))
            m = DeleteGame(self.db, content['game_id'], content['pwd'])
            print(m)
            if m != None:
                request.setResponseCode(200)
                return json.dumps({ "success": 1, "message": m}).encode("utf8")
            else:
                return json.dumps({"success": 0, "message": "Not authorized to remove game or bad id"}).encode("utf8")



def main():
    if args.verbose:
        log.startLogging(sys.stdout)
    root = Resource()
    root.putChild(b"web", File("./web"))
    root.putChild(b"scripts", File("./scripts"))
    root.putChild(b"styles", File("./styles"))
    root.putChild(b"data",  DataFetching(args.database))

    factory = Site(root)
    endpoint = endpoints.TCP4ServerEndpoint(reactor, args.port)
    endpoint.listen(factory)
    reactor.run()

if __name__ == "__main__":
    # execute only if run as a script
    main()
