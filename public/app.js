var app = angular.module("APP",['ui.router','smart-table']);
app.component("wallet",{
  templateUrl:"wallet.html",
  controller:function($scope,$http,$interval){
    var $ctrl = this;
    $ctrl.getBalance =function(){
      $http.get("/balance").then(function(res){
        $ctrl.balance = res.data.balance;
      },function(erre){
        //alert("Can't get balance in your wallet")
      });
    }
    $ctrl.getMyAddress = function(){
      $http.get("/myAddress").then(function(res){
        $ctrl.myAddress = res.data;
      },function(error){
        //alert("Can't get your address")
      });
    }
    $ctrl.getPrivate = function(){
      $http.get("/privateKey").then(function(res){
        $ctrl.privateKey = res.data;
      },function(error){
        //alert("Can't get your private key")
      });
    }
    $ctrl.replaceWallet = function(privateKey){
      if(!$ctrl.isEdit){
        $ctrl.isEdit = true;
        return;
      }
      $http.post("/replaceWallet",{privateKey:privateKey}).then(function(res){
        $ctrl.myAddress = res.data;
        $ctrl.getBalance();
        $ctrl.isEdit=false;
      },function(error){
        alert(error.data);
      })
    }
    $ctrl.sendTransaction = function(address,amount){
      $ctrl.msg_success = "";
      $ctrl.msg_error ="";
      $http.post("/spend",{address_receiver:address,amount:amount}).then(function(res){
        $ctrl.msg_success = "Transaction was sent successfull.";
        $ctrl.getBalance();
      },function(error){
        $ctrl.msg_error = "Error: " + error.data;
      })
    }
    $ctrl.getPrivate();
    $ctrl.getMyAddress();
    $ctrl.getBalance();
    var ref = $interval(function(){
        $ctrl.getBalance();
    },5*60*1000);
    $scope.$on('$destroy', function() {
      $interval.cancel(ref);
    });
  }
})
app.component("received",{
  templateUrl:"received.html",
  controller:function($scope,$http){
    var $ctrl = this;
    $ctrl.itemsByPage = 5;
    $http.get("/receivedTransactions").then(function(res){
      $ctrl.transactionPool = res.data;

    })
  }
})
app.component("sent",{
  templateUrl:"sent.html",
  controller:function($scope,$http){
    var $ctrl = this;
    $ctrl.itemsByPage = 5;
    $http.get("/sentTransactions").then(function(res){
      $ctrl.transactionPool = res.data;

    })
  }
})
app.component("mineBlock",{
  templateUrl:"mine.html",
  controller:function($scope,$http,$interval,$timeout){
    var $ctrl = this;
    $ctrl.blocksFound=[];
    $ctrl.round = function(number, precision) {
        if(!precision) precision =0;
        var factor = Math.pow(10, precision);
        var tempNumber = number * factor;
        var roundedTempNumber = Math.round(tempNumber);
        return roundedTempNumber / factor;
    };
    var mine = function(){
      if(!$ctrl.running) return;
      $http.get("/mineBlock").then(function(res){
        console.log("Mining...");
      },function(error){
        if(error.data){
          console.error("error",error.data);
        }
        $ctrl.running = false;
      });
    }
    $ctrl.start = function(){
      $ctrl.running = true;
      mine();

    }
    $ctrl.stop = function(){
      $ctrl.running = false;
      $http.get("/stopMineBlock").then(function(res){
      });
    }
    $ctrl.getPeers = function(){
      $http.get("/peers").then(function(res){
        $ctrl.peers = res.data;
        if($ctrl.peers.length==0){
          $ctrl.running =false;
        }
      })
    }
    $ctrl.countBlocks = function(){
      $http.get("/countBlocks").then(function(res){
        $ctrl.number_blocks = res.data.number_blocks;
      })
    }

    $ctrl.addPeer = function(peer){
      $ctrl.peerToAdd ="";
      $http.post("/addPeer",{peer:peer}).then(function(res){
          $timeout(function(){
            $ctrl.getPeers()
          },100)

      },function(error){
          alert("Error: " + error.data);
      })
    }
    $ctrl.removePeer = function(peer){
      if(confirm("Do you want to remove this peer?")){
        $http.post("/removePeer",{peer:peer}).then(function(res){
            $timeout(function(){
              $ctrl.getPeers()
            },300)

        },function(error){
            alert("Error: " + error.data);
        })
      }

    }
    $http.get("/mineStatus").then(function(res){
      $ctrl.running = res.data.is_mining;
    });
    $ctrl.getPeers();
    $ctrl.countBlocks();

    var ref = $interval(function () {
      $ctrl.getPeers();
      $ctrl.countBlocks();
    }, 60*1000);

    $scope.$on('$destroy', function() {
      $interval.cancel(ref);
    });
  }
})

app.config(function($stateProvider,$urlRouterProvider){
  $stateProvider.state({
    name:"wallet",
    url:"/wallet",
    component:"wallet"
  });
  $stateProvider.state({
    name:"wallet.received",
    url:"/received",
    component:"received"
  });
  $stateProvider.state({
    name:"wallet.sent",
    url:"/sent",
    component:"sent"
  });

  $stateProvider.state({
    name:"mineBlock",
    url:"/mineBlock",
    component:"mineBlock"
  });
  $urlRouterProvider.otherwise("/wallet");
})
