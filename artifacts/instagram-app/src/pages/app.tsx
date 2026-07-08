import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  useGetSession, 
  useGetFollowers, 
  useLogout, 
  useFollowUser, 
  useUnfollowUser,
  getGetFollowersQueryKey,
  Follower
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { 
  Search, 
  LogOut, 
  Users, 
  UserPlus, 
  SearchX,
  UserCircle2,
  ShieldCheck,
  Lock,
  Loader2
} from "lucide-react";

type FilterType = "all" | "male" | "female" | "not_following" | "recommended";

export default function AppDashboard() {
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const sessionId = localStorage.getItem("instagram_session_id") || "";
  const { data: session, isLoading: isCheckingSession } = useGetSession();
  const logoutMutation = useLogout();
  
  const followUser = useFollowUser();
  const unfollowUser = useUnfollowUser();

  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  const { 
    data: followersData, 
    isLoading: isLoadingFollowers 
  } = useGetFollowers(session?.username || "", {
    sessionId
  }, {
    query: {
      enabled: !!session?.username && !!sessionId,
      queryKey: getGetFollowersQueryKey(session?.username || "", { sessionId })
    }
  });

  useEffect(() => {
    if (!isCheckingSession && (!session?.loggedIn || !sessionId)) {
      setLocation("/");
    }
  }, [session, isCheckingSession, sessionId, setLocation]);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        localStorage.removeItem("instagram_session_id");
        setLocation("/");
      }
    });
  };

  const handleFollowToggle = (user: Follower) => {
    const isFollowing = user.followedByViewer;
    const mutation = isFollowing ? unfollowUser : followUser;
    
    mutation.mutate({
      userId: user.userId,
      data: { sessionId }
    }, {
      onSuccess: () => {
        // Optimistic update
        queryClient.setQueryData(
          getGetFollowersQueryKey(session?.username || "", { sessionId }),
          (old: any) => {
            if (!old) return old;
            return {
              ...old,
              followers: old.followers.map((f: Follower) => 
                f.userId === user.userId 
                  ? { ...f, followedByViewer: !isFollowing }
                  : f
              ),
              stats: old.stats ? {
                ...old.stats,
                following: old.stats.following + (isFollowing ? -1 : 1)
              } : undefined
            };
          }
        );
        toast({
          title: isFollowing ? "Unfollowed" : "Followed",
          description: `Successfully ${isFollowing ? 'unfollowed' : 'followed'} @${user.username}`
        });
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Action failed",
          description: `Failed to ${isFollowing ? 'unfollow' : 'follow'} @${user.username}`
        });
      }
    });
  };

  const filteredFollowers = useMemo(() => {
    if (!followersData?.followers) return [];
    
    return followersData.followers.filter(follower => {
      // Apply search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesUsername = follower.username.toLowerCase().includes(query);
        const matchesName = follower.fullName?.toLowerCase().includes(query);
        if (!matchesUsername && !matchesName) return false;
      }
      
      // Apply category filter
      switch (filter) {
        case "male":
          return follower.gender === "male" || follower.gender === "mostly_male";
        case "female":
          return follower.gender === "female" || follower.gender === "mostly_female";
        case "not_following":
          return !follower.followedByViewer;
        case "recommended":
          // simple recommendation heuristic: not followed and not private
          return !follower.followedByViewer && !follower.isPrivate;
        case "all":
        default:
          return true;
      }
    });
  }, [followersData?.followers, searchQuery, filter]);

  if (isCheckingSession || (!session?.loggedIn && !sessionId)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const stats = followersData?.stats;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-orange-500 via-pink-500 to-purple-600 p-[1.5px]">
              <div className="w-full h-full bg-black/80 rounded-[6px] flex items-center justify-center">
                <Users className="w-4 h-4 text-white" />
              </div>
            </div>
            <span className="font-semibold tracking-tight text-lg">Follower Analyzer</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-sm text-white/50 hidden sm:block">
              Logged in as <span className="text-white font-medium">@{session?.username}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-white/70 hover:text-white">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl flex flex-col gap-8">
        {/* Stats Row */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Followers" value={stats?.total} icon={<Users className="w-5 h-5 text-purple-400" />} isLoading={isLoadingFollowers} />
          <StatCard title="Following Back" value={stats?.following} icon={<UserPlus className="w-5 h-5 text-green-400" />} isLoading={isLoadingFollowers} />
          <StatCard title="Male Demographics" value={stats?.male} icon={<UserCircle2 className="w-5 h-5 text-blue-400" />} isLoading={isLoadingFollowers} />
          <StatCard title="Female Demographics" value={stats?.female} icon={<UserCircle2 className="w-5 h-5 text-pink-400" />} isLoading={isLoadingFollowers} />
        </section>

        {/* Controls */}
        <section className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card/40 p-2 rounded-xl border border-white/5 backdrop-blur-sm">
          <div className="w-full md:w-auto overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)} className="w-full">
              <TabsList className="bg-transparent border border-white/10 h-11 p-1">
                <TabsTrigger value="all" className="rounded-md">All</TabsTrigger>
                <TabsTrigger value="male" className="rounded-md text-blue-400 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300">Male</TabsTrigger>
                <TabsTrigger value="female" className="rounded-md text-pink-400 data-[state=active]:bg-pink-500/20 data-[state=active]:text-pink-300">Female</TabsTrigger>
                <TabsTrigger value="not_following" className="rounded-md">Not Following</TabsTrigger>
                <TabsTrigger value="recommended" className="rounded-md">Recommended</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input 
              placeholder="Search followers..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-black/40 border-white/10 focus-visible:ring-purple-500/50"
            />
          </div>
        </section>

        {/* Follower Grid */}
        <section className="flex-1">
          {isLoadingFollowers ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <Card key={i} className="bg-card/40 border-white/5">
                  <CardContent className="p-4 flex items-center gap-4">
                    <Skeleton className="w-12 h-12 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredFollowers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <SearchX className="w-8 h-8 text-white/20" />
              </div>
              <div>
                <h3 className="text-xl font-medium text-white/90">No followers found</h3>
                <p className="text-white/50 mt-1 max-w-sm">
                  {searchQuery 
                    ? `No matches for "${searchQuery}" in this category.` 
                    : "No followers match the current filters."}
                </p>
              </div>
              {(searchQuery || filter !== "all") && (
                <Button variant="outline" onClick={() => { setSearchQuery(""); setFilter("all"); }} className="mt-4">
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <AnimatePresence>
                {filteredFollowers.map((follower, index) => (
                  <motion.div
                    key={follower.userId}
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2, delay: Math.min(index * 0.05, 0.5) }}
                  >
                    <Card className="group overflow-hidden border-white/5 bg-card/40 hover:bg-card/80 transition-colors">
                      <CardContent className="p-4 flex flex-col gap-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar className="w-12 h-12 border-white/10 shadow-sm">
                              <AvatarImage src={follower.profilePicUrl} />
                              <AvatarFallback className="bg-gradient-to-br from-purple-500/20 to-orange-500/20 text-white/70">
                                {follower.username.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-sm text-white/90 truncate max-w-[120px]" title={follower.username}>
                                  {follower.username}
                                </span>
                                {follower.isVerified && <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />}
                                {follower.isPrivate && <Lock className="w-3.5 h-3.5 text-white/40" />}
                              </div>
                              <span className="text-xs text-white/50 truncate max-w-[140px]" title={follower.fullName}>
                                {follower.fullName || "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between mt-1">
                          <div className="flex gap-1.5">
                            {follower.gender === "male" || follower.gender === "mostly_male" ? (
                              <Badge variant="male" className="h-5 text-[10px] uppercase tracking-wider">Male</Badge>
                            ) : follower.gender === "female" || follower.gender === "mostly_female" ? (
                              <Badge variant="female" className="h-5 text-[10px] uppercase tracking-wider">Female</Badge>
                            ) : (
                              <Badge variant="unknown" className="h-5 text-[10px] uppercase tracking-wider">Unknown</Badge>
                            )}
                          </div>
                          
                          <Button 
                            size="sm" 
                            variant={follower.followedByViewer ? "secondary" : "default"}
                            className={cn(
                              "h-7 text-xs px-3 rounded-full transition-all",
                              !follower.followedByViewer && "bg-white text-black hover:bg-white/90 font-medium",
                              follower.followedByViewer && "bg-white/10 text-white hover:bg-red-500/20 hover:text-red-400"
                            )}
                            onClick={() => handleFollowToggle(follower)}
                            disabled={followUser.isPending || unfollowUser.isPending}
                          >
                            {follower.followedByViewer ? "Following" : "Follow"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function StatCard({ title, value, icon, isLoading }: { title: string, value?: number, icon: React.ReactNode, isLoading: boolean }) {
  return (
    <Card className="bg-card/40 border-white/5">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-white/50 uppercase tracking-wider">{title}</p>
          {isLoading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <p className="text-2xl font-bold tracking-tight text-white/90">
              {value !== undefined ? value.toLocaleString() : "—"}
            </p>
          )}
        </div>
        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

