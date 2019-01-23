var rankingGraph = null;
var progressGraph = null;

var rankingGraphOptions = {
    chart: {
        renderTo: 'rankings_graph',
    },
    tooltip: { enabled: false},
    plotOptions: {
        areaspline:
        {
            fillOpacity : 0.3,
            enableMouseTracking: false
        }        
    },
    title: {
        text:"TopTracer TrueSkill(mod) Padel Ranking"
    },
    xAxis: {
    },
    yAxis: [{ 
        labels: "",
        title: {
            text: "",
        }
        }],
    legend: {
        reversed: true
    }
    //     enabled: false,
    //     align: 'center',
    //     verticalAlign: 'bottom',
    //     floating: false,
    //     backgroundColor: (Highcharts.theme && Highcharts.theme.legendBackgroundColor) || '#FFFFFF'
    //};
};

var progressGraphOptions = {
    chart: {
        renderTo: 'progress_graph',
    },
    plotOptions: {
    },
    title: {
        text:"TopTracer TrueSkill(mod) Progress Graph"
    },
    tooltip: {
        shared: true
    },
    xAxis: {
    },
    yAxis: [{ 
        opposite: true,
        title: {
            text: "Score",
        }
        }],
    legend: {
        layout: 'vertical',
        align: 'right',
        verticalAlign: 'middle'
    }
};



function NormalDistribution(x, mu, sigma)
{
    return 1.0 / (sigma * Math.sqrt(2.0 * Math.PI)) * Math.exp(-(x-mu)*(x-mu) / (2.0 * sigma*sigma)) 
}

function NormalDistributionData(mu, sigma)
{
    var data = []
    
    var start = mu - sigma * 4.0; 
    var end   = mu + sigma * 4.0; 
    
    var step = (end - start) / 30.0;
    var x = start;
    while(x <= end)
    {
        data.push([x, NormalDistribution(x, mu, sigma)]);
        x += step;
    }
    return data;
}


function UpdateRankingsGraphData(rankings) 
{
    if(rankings == null)
        return;

    //var graph = $("#rankings_graph");
    var series = []
    var idx = 0
    var plotLines = []
    for(var i in rankings)
    {
        var r = rankings[i]
        var serie = {
            type: 'areaspline',
            marker: {enabled:false},
            name: r.Name,
            zIndex: i,
            data: NormalDistributionData(r.TrueSkill.mu, r.TrueSkill.sigma)
        };
        var plotLine = {
            value: r.TrueSkill.ranking,
            width: 1,
            color: Highcharts.getOptions().colors[i],
            zIndex: rankings.length + 1,
            label: { 
                text: r.Name,
                style: {
                    x: 10*i,
                    y: 10*i,
                    color: Highcharts.getOptions().colors[i]
                }
            }
        }
        plotLines.push(plotLine);
        series.push(serie);  
    }
    rankingGraphOptions.series = series;
    rankingGraphOptions.xAxis.plotLines = plotLines;
    rankingGraph.update(rankingGraphOptions,true, true,false);
}

function UpdateProgressGraphData(rankings) 
{
    if(rankings == null)
        return;

    //var graph = $("#rankings_graph");
    var series = []
    var idx = 0
    var plotLines = []
    for(var i in rankings)
    {
        var r = rankings[i]
        var serie = {
            type: 'spline',
            //marker: {enabled:false},
            name: r.Name,
            zIndex: i,
            data: r.Progress
        };
        series.push(serie);  
    }
    progressGraphOptions.series = series;
    progressGraphOptions.xAxis.plotLines = plotLines;
    progressGraph.update(progressGraphOptions,true, true,false);
}


function UpdateRankings(rankings)
{
    if(rankings == null)
        return;

    var prevRanking = 0.0;
    var pos = 1;
    var table = $("#rankings_table");
    table.empty();
    for(var i = 0; i < rankings.length; i++)
    {
        var name = rankings[i].Name;
        var ranking = rankings[i].TrueSkill.ranking;
        var record = rankings[i].Record;
        var recordString = record.wins + '-' + record.draws + '-' + record.losses;

        if(ranking != prevRanking)
            pos = i + 1;
        table.append("<tr class=\"ranking\"><td>"+pos+"</td><td>"+name+"</td>"+
                    "<td class=\"small\">"+recordString+"</td>"+
                    "<td class=\"small\">"+ranking.toFixed(3)+"</td>");
        prevRanking = ranking;
    }
}

function nick_compare(a,b)
{
    if(a.nick < b.nick)
        return -1;
    if(a.nick > b.nick)
        return 1;
    return 0;
}

function UpdatePlayerSelection(resp)
{
    var selections = [$("#player1"), $("#player2"), $("#player3"), $("#player4")];

    resp.sort(nick_compare);
    for(var s in selections)
    {
        selections[s].empty();
        for(var i in resp)
        {
            var r = resp[i];
            selected = i == s ? "selected" : "";
            selections[s].append("<option value=" +r.id+ " " +selected+">"+r.nick+"</option>");
        }
    }
}

function UpdateGames(games)
{
    if(games == null)
        return;
    var table = $("#last_games");
    table.empty();
    for(var i = games.length - 1; i >= 0 && i >= games.length - 12; i--)
    {
        var game = games[i];
        var p1 = game.player1;
        var p2 = game.player2;
        var p3 = game.player3;
        var p4 = game.player4;

        var score1 = game.score1
        var score2 = game.score2;

        var id = game.id;
        var d = new Date(game.date);
        var date = d.toLocaleDateString()

        table.append("<tr class=\"games\"><td class='small'>"+id +"</td><td class='small'>"+ date +"</td><td>"+p1+","+p2+"</td><td>"+p3+","+p4+"</td><td>"+score1+"-"+score2+"</td>");
    }
}

function GetPlayers() {
    $.getJSON("/data", { players: true }, function (resp, reqstatus) {
        if (reqstatus == "success" && resp != null) {
            UpdatePlayerSelection(resp);
        }
    });
}


function GetRankings() {
    $.getJSON("/data", { rankings: true }, function (resp, reqstatus) {
        if (reqstatus == "success" && resp != null) {
            UpdateRankings(resp);
            UpdateRankingsGraphData(resp)
            UpdateProgressGraphData(resp)
        }
    });
}

function GetGames() {
    $.getJSON("/data", { games: true }, function (resp, reqstatus) {
        if (reqstatus == "success" && resp != null) {
            UpdateGames(resp);
        }
    });
}

function AddGameButtonEnable()
{
    var p1 = parseInt($("#player1").val());
    var p2 = parseInt($("#player2").val());
    var p3 = parseInt($("#player3").val());
    var p4 = parseInt($("#player4").val());

    var s1 = parseInt($("#score1").val());
    var s2 = parseInt($("#score2").val());

    var disabled = isNaN(p1) || isNaN(p2) ||
                   isNaN(p3) || isNaN(p4) ||
                   isNaN(s1) || isNaN(s2) ||
                   p1 == p2 || p1 == p3 || p1 == p4 ||
                   p2 == p3 || p2 == p4 ||
                   p3 == p4 ||
                   s1 < 0 || s2 < 0 || s1 + s2 == 0;
 
        
    $("#add_game").prop("disabled", disabled);
}

function AddPlayerButtonEnable()
{
    var fn = $("#firstname").val();
    var ln = $("#lastname").val();
    var dn = $("#nick").val();

    var disabled = (fn == null || fn == "" || 
                    ln == null || ln == "" ||
                    dn == null || dn == "" );

    $("#add_player").prop("disabled", disabled);
}


function DeleteGame()
{
    var id = parseInt($("#game_id").val());
    var pwd = $("#password").val();

    if(isNaN(id) || pwd == null)
    {
        alert("Id and password is needed");
        return;
    }

    $.ajax({
        url : "/data/delete_game",
        type: "POST",
        data: JSON.stringify(
            { 
                "pwd": pwd, 
                "game_id": id,
            }),
        contentType: "application/json; charset=utf-8",
        dataType   : "json",
        success    : function(result,status,xhr){
            alert(result.message);
            if (status == "success")
            { 
                GetGames();
                GetRankings();
            }
        },
        error: function (xhr, ajaxOptions, thrownError) {
            //alert(xhr.status);
            alert(thrownError);
        }
    });
}

function ValidateAndAddGame() 
{
    var p1 = parseInt($("#player1").val());
    var p2 = parseInt($("#player2").val());
    var p3 = parseInt($("#player3").val());
    var p4 = parseInt($("#player4").val());

    var s1 = parseInt($("#score1").val());
    var s2 = parseInt($("#score2").val());

    if(isNaN(p1) || isNaN(p2) ||
       isNaN(p3) || isNaN(p4) ||
       isNaN(s1) || isNaN(s2) ||
       p1 == p2 || p1 == p3 || p1 == p4 ||
       p2 == p3 || p2 == p4 ||
       p3 == p4 ||
       s1 < 0 || s2 < 0 || s1 + s2 == 0)
    {
        alert("Need to have 4 different players and valid scores");
    }
    else
    {
        $.ajax({
            url : "/data/add_game",
            type: "POST",
            data: JSON.stringify(
                { 
                    "player1": p1, 
                    "player2": p2,
                    "player3": p3,
                    "player4": p4,
                    "score1": s1,
                    "score2": s2,
                    "americano": (s1 > 7 || s2 > 7) ? 1 : 0
                }),
            contentType: "application/json; charset=utf-8",
            dataType   : "json",
            success    : function(result,status,xhr){
                alert(result.message);
                if (status == "success")
                { 
                    GetGames();
                    GetRankings();
                }
            },
            error: function (xhr, ajaxOptions, thrownError) {
                //alert(xhr.status);
                alert(thrownError);
            }
        });
    }
}

function ValidateAndAddPlayer()
{
    var fn = $("#firstname").val();
    var ln = $("#lastname").val();
    var dn = $("#nick").val();

    if(fn == "FirstName" || ln == "LastName" || dn == "DisplayName")
    {
        alert("Bad naming of player - Need to fill all names");
    }
    else 
    {
        $.ajax({
            url : "/data/add_player",
            type: "POST",
            data: JSON.stringify(
                { 
                    "firstname": fn, 
                    "lastname": ln,
                    "nick": dn
                }
            ),
            contentType: "application/json; charset=utf-8",
            dataType   : "json",
            success    : function(result,status,xhr){
                alert(result.message);
                if (status == "success")
                {
                    GetPlayers();
                    GetRankings();                
                }
            },
            error: function (xhr, ajaxOptions, thrownError) {
                //alert(xhr.status);
                alert(thrownError);
            }
        });
    }
}


function RankingsStartup()
{
    rankingGraph = Highcharts.chart(rankingGraphOptions);
    progressGraph = Highcharts.chart(progressGraphOptions);
    GetRankings();
    GetPlayers();
    GetGames();
    $("#add_player").click(function() {ValidateAndAddPlayer();});
    $("#add_game").click(function() {ValidateAndAddGame();});
    $("#delete_game").click(function() {DeleteGame();});
    AddGameButtonEnable();
    AddPlayerButtonEnable();

    var arr = [ $("#player1"), $("#player2"), $("#player3"), $("#player4"), $("#score1"),$("#score2")]; 
    for(var i in arr)
    {
        arr[i].change(function() { AddGameButtonEnable();});
        arr[i].keyup(function() { AddGameButtonEnable();});
        arr[i].click(function() { AddGameButtonEnable();});
    }

    arr = [ $("#firstname"), $("#lastname"), $("#nick") ];
    for(var i in arr)
    {
        arr[i].change(function() { AddPlayerButtonEnable();});
        arr[i].keyup(function() { AddPlayerButtonEnable();});
    }

}
