"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Briefcase,
  FileText,
  MessageSquare,
  Star,
  DollarSign,
  Loader2,
  Trash2,
  CheckCircle2,
  Clock,
  Send,
  XCircle,
  Eye,
  ChevronRight,
} from "lucide-react";
import axios from "axios";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/context/SocketContext";
import { Application, Job, Milestone } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

type WeeklyData = {
  week: string;
  amount: number;
};

type DashboardStats = {
  activeJobs: number;
  pendingApplications: number;
  totalEarnings: number;
  totalSpent: number;
  avgRating: number;
  reviewCount: number;
};

type ExtendedJob = Job & {
  _count?: { applications: number };
};

type ExtendedApplication = Application & {
  job?: { id: string; title: string };
};

export default function DashboardPage() {
  const { user, token, isLoading } = useAuth();
  const { socket } = useSocket();
  const isClient = user?.role === "CLIENT";

  const clientTabs = ["Overview", "My Posted Jobs", "Applicants to Review"];
  const freelancerTabs = ["Overview", "Job Pipeline", "My Applications"];
  const tabs = isClient ? clientTabs : freelancerTabs;

  const [activeTab, setActiveTab] = useState("Overview");
  const [stats, setStats] = useState<DashboardStats>({
    activeJobs: 0,
    pendingApplications: 0,
    totalEarnings: 0,
    totalSpent: 0,
    avgRating: 0,
    reviewCount: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
  const [chartLoading, setChartLoading] = useState(true);

  const [jobs, setJobs] = useState<ExtendedJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  const [applications, setApplications] = useState<ExtendedApplication[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [withdrawConfirmId, setWithdrawConfirmId] = useState<string | null>(null);

  const [pendingApplicants, setPendingApplicants] = useState<ExtendedApplication[]>([]);
  const [applicantsLoading, setApplicantsLoading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab("Overview");
  }, [isClient]);

  const fetchStats = useCallback(async () => {
    if (!token || !user?.id) return;
    setStatsLoading(true);
    try {
      const [jobsRes, txRes] = await Promise.all([
        axios.get(`${API_URL}/jobs/mine`, {
          params: { limit: 100 },
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/transactions/summary/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const myJobs: ExtendedJob[] = jobsRes.data.data ?? [];
      const activeCount = myJobs.filter(
        (j) => j.status === "IN_PROGRESS" && (isClient ? j.client?.id === user.id : j.freelancer?.id === user.id)
      ).length;

      let pendingAppsCount = 0;
      if (isClient) {
        const appsRes = await axios.get(`${API_URL}/applications`, {
          params: { status: "PENDING", limit: 100 },
          headers: { Authorization: `Bearer ${token}` },
        });
        const clientJobIds = myJobs.filter((j) => j.client?.id === user.id).map((j) => j.id);
        pendingAppsCount = (appsRes.data.data ?? []).filter(
          (a: ExtendedApplication) => clientJobIds.includes(a.jobId)
        ).length;
      } else {
        const appsRes = await axios.get(`${API_URL}/applications`, {
          params: { freelancerId: user.id, status: "PENDING", limit: 100 },
          headers: { Authorization: `Bearer ${token}` },
        });
        pendingAppsCount = appsRes.data.total ?? 0;
      }

      setStats({
        activeJobs: activeCount,
        pendingApplications: pendingAppsCount,
        totalEarnings: txRes.data.totalEarned ?? 0,
        totalSpent: txRes.data.totalSpent ?? 0,
        avgRating: user.averageRating ?? 0,
        reviewCount: user.reviewCount ?? 0,
      });
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, [token, user, isClient]);

  const fetchWeeklyData = useCallback(async () => {
    if (!token) return;
    setChartLoading(true);
    try {
      const eightWeeksAgo = new Date();
      eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

      const res = await axios.get(`${API_URL}/transactions`, {
        params: {
          dateFrom: eightWeeksAgo.toISOString(),
          limit: 500,
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      const transactions = res.data.transactions ?? [];
      const weekMap: Record<string, number> = {};

      for (let i = 7; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i * 7);
        const weekLabel = `W${8 - i}`;
        weekMap[weekLabel] = 0;
      }

      transactions.forEach((tx: { createdAt: string; amount: number; toAddress?: string; fromAddress?: string }) => {
        const txDate = new Date(tx.createdAt);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24));
        const weekIndex = Math.floor(diffDays / 7);
        if (weekIndex >= 0 && weekIndex < 8) {
          const weekLabel = `W${8 - weekIndex}`;
          if (isClient) {
            if (tx.fromAddress && user?.walletAddress === tx.fromAddress) {
              weekMap[weekLabel] += tx.amount;
            }
          } else {
            if (tx.toAddress && user?.walletAddress === tx.toAddress) {
              weekMap[weekLabel] += tx.amount;
            }
          }
        }
      });

      const data = Object.entries(weekMap).map(([week, amount]) => ({
        week,
        amount: Math.round(amount),
      }));

      setWeeklyData(data);
    } catch (err) {
      console.error("Failed to fetch weekly data:", err);
      setWeeklyData([]);
    } finally {
      setChartLoading(false);
    }
  }, [token, user?.walletAddress, isClient]);

  const fetchJobs = useCallback(async () => {
    if (!token) return;
    setJobsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/jobs/mine`, {
        params: { limit: 50 },
        headers: { Authorization: `Bearer ${token}` },
      });
      setJobs(res.data.data ?? []);
    } catch {
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }, [token]);

  const fetchMyApplications = useCallback(async () => {
    if (!token || !user?.id) return;
    setAppsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/applications`, {
        params: { freelancerId: user.id, limit: 50 },
        headers: { Authorization: `Bearer ${token}` },
      });
      setApplications(res.data.data ?? []);
    } catch {
      setApplications([]);
    } finally {
      setAppsLoading(false);
    }
  }, [token, user?.id]);

  const fetchPendingApplicants = useCallback(async () => {
    if (!token || !user?.id || !isClient) return;
    setApplicantsLoading(true);
    try {
      const jobsRes = await axios.get(`${API_URL}/jobs/mine`, {
        params: { limit: 100 },
        headers: { Authorization: `Bearer ${token}` },
      });
      const clientJobs: ExtendedJob[] = (jobsRes.data.data ?? []).filter(
        (j: ExtendedJob) => j.client?.id === user.id && j.status === "OPEN"
      );

      const allApps: ExtendedApplication[] = [];
      for (const job of clientJobs) {
        try {
          const appsRes = await axios.get(`${API_URL}/jobs/${job.id}/applications`, {
            params: { status: "PENDING", limit: 20 },
            headers: { Authorization: `Bearer ${token}` },
          });
          const apps = (appsRes.data.data ?? []).map((a: ExtendedApplication) => ({
            ...a,
            job: { id: job.id, title: job.title },
          }));
          allApps.push(...apps);
        } catch {
          // Skip jobs with fetch errors
        }
      }
      setPendingApplicants(allApps);
    } catch {
      setPendingApplicants([]);
    } finally {
      setApplicantsLoading(false);
    }
  }, [token, user?.id, isClient]);

  useEffect(() => {
    fetchStats();
    fetchWeeklyData();
  }, [fetchStats, fetchWeeklyData]);

  useEffect(() => {
    if (activeTab === "My Posted Jobs" || activeTab === "Job Pipeline") {
      fetchJobs();
    }
  }, [activeTab, fetchJobs]);

  useEffect(() => {
    if (activeTab === "My Applications" && !isClient) {
      fetchMyApplications();
    }
  }, [activeTab, isClient, fetchMyApplications]);

  useEffect(() => {
    if (activeTab === "Applicants to Review" && isClient) {
      fetchPendingApplicants();
    }
  }, [activeTab, isClient, fetchPendingApplicants]);

  useEffect(() => {
    if (!socket) return;

    const handleJobUpdate = () => {
      fetchStats();
      fetchJobs();
    };

    socket.on("job_status_changed", handleJobUpdate);
    socket.on("milestone_approved", handleJobUpdate);
    socket.on("application_accepted", handleJobUpdate);

    return () => {
      socket.off("job_status_changed", handleJobUpdate);
      socket.off("milestone_approved", handleJobUpdate);
      socket.off("application_accepted", handleJobUpdate);
    };
  }, [socket, fetchStats, fetchJobs]);

  const handleWithdraw = async (appId: string) => {
    setWithdrawingId(appId);
    try {
      await axios.delete(`${API_URL}/applications/${appId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setApplications((prev) => prev.filter((a) => a.id !== appId));
      fetchStats();
    } catch {
      // Keep list unchanged on error
    } finally {
      setWithdrawingId(null);
      setWithdrawConfirmId(null);
    }
  };

  const handleApplicationAction = async (appId: string, action: "ACCEPTED" | "REJECTED") => {
    setActioningId(appId);
    try {
      await axios.put(
        `${API_URL}/applications/${appId}/status`,
        { status: action },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPendingApplicants((prev) => prev.filter((a) => a.id !== appId));
      fetchStats();
      fetchJobs();
    } catch {
      // Keep unchanged on error
    } finally {
      setActioningId(null);
    }
  };

  const pipelineColumns = useMemo(() => {
    const applied = applications.filter((a) => a.status === "PENDING");
    const accepted = applications.filter((a) => a.status === "ACCEPTED");
    const inProgress = jobs.filter(
      (j) => j.freelancer?.id === user?.id && j.status === "IN_PROGRESS"
    );
    const completed = jobs.filter(
      (j) => j.freelancer?.id === user?.id && j.status === "COMPLETED"
    );

    return { applied, accepted, inProgress, completed };
  }, [applications, jobs, user?.id]);

  const clientJobsGrouped = useMemo(() => {
    const clientJobs = jobs.filter((j) => j.client?.id === user?.id);
    return {
      open: clientJobs.filter((j) => j.status === "OPEN"),
      inProgress: clientJobs.filter((j) => j.status === "IN_PROGRESS"),
      completed: clientJobs.filter((j) => j.status === "COMPLETED"),
    };
  }, [jobs, user?.id]);

  const getMilestoneProgress = (milestones: Milestone[]) => {
    if (!milestones || milestones.length === 0) return 0;
    const approved = milestones.filter((m) => m.status === "APPROVED").length;
    return Math.round((approved / milestones.length) * 100);
  };

  const displayStats = isClient
    ? [
        { label: "Posted Jobs", value: clientJobsGrouped.open.length + clientJobsGrouped.inProgress.length, icon: Briefcase, color: "text-stellar-blue" },
        { label: "Applicants to Review", value: stats.pendingApplications, icon: FileText, color: "text-yellow-400" },
        { label: "Total Spent", value: `${stats.totalSpent.toLocaleString()} XLM`, icon: DollarSign, color: "text-stellar-purple" },
        { label: "Rating", value: stats.avgRating > 0 ? `${stats.avgRating.toFixed(1)}/5` : "N/A", icon: Star, color: "text-green-400" },
      ]
    : [
        { label: "Active Jobs", value: stats.activeJobs, icon: Briefcase, color: "text-stellar-blue" },
        { label: "Pending Applications", value: stats.pendingApplications, icon: FileText, color: "text-yellow-400" },
        { label: "Total Earnings", value: `${stats.totalEarnings.toLocaleString()} XLM`, icon: DollarSign, color: "text-stellar-purple" },
        { label: "Rating", value: stats.avgRating > 0 ? `${stats.avgRating.toFixed(1)}/5` : "N/A", icon: Star, color: "text-green-400" },
      ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-stellar-blue" size={48} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-theme-heading mb-8">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statsLoading ? (
          <div className="col-span-full flex justify-center py-12">
            <Loader2 className="animate-spin text-stellar-blue" size={32} />
          </div>
        ) : (
          displayStats.map((stat) => (
            <div key={stat.label} className="card flex items-center gap-4">
              <div className={`${stat.color}`}>
                <stat.icon size={24} />
              </div>
              <div>
                <div className="text-2xl font-bold text-theme-heading">
                  {stat.value}
                </div>
                <div className="text-sm text-theme-text">{stat.label}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-theme-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 px-1 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
              activeTab === tab
                ? "text-stellar-blue border-stellar-blue"
                : "text-theme-text border-transparent hover:text-theme-heading"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "Overview" && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-xl font-semibold text-theme-heading mb-4">
              {isClient ? "Spending Overview" : "Earnings Overview"}
            </h2>
            {chartLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="animate-spin text-stellar-blue" size={32} />
              </div>
            ) : weeklyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="week" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1F2937",
                      border: "1px solid #374151",
                      borderRadius: "0.5rem",
                    }}
                    labelStyle={{ color: "#F3F4F6" }}
                  />
                  <Bar dataKey="amount" fill="#7B3FF2" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-theme-text">
                No transaction data available
              </div>
            )}
          </div>
        </div>
      )}

      {/* Freelancer Job Pipeline */}
      {!isClient && activeTab === "Job Pipeline" && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="text-yellow-400" size={20} />
              <h3 className="font-semibold text-theme-heading">Applied</h3>
              <span className="text-xs bg-yellow-400/20 text-yellow-400 px-2 py-0.5 rounded-full">
                {pipelineColumns.applied.length}
              </span>
            </div>
            <div className="space-y-2">
              {pipelineColumns.applied.map((app) => (
                <Link
                  key={app.id}
                  href={`/jobs/${app.jobId}`}
                  className="block p-3 bg-theme-bg rounded-lg hover:bg-theme-border/50 transition-colors"
                >
                  <p className="text-sm font-medium text-theme-heading truncate">
                    {app.job?.title || "Job"}
                  </p>
                  <p className="text-xs text-theme-text mt-1">
                    {new Date(app.createdAt).toLocaleDateString()}
                  </p>
                </Link>
              ))}
              {pipelineColumns.applied.length === 0 && (
                <p className="text-sm text-theme-text text-center py-4">No applications</p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="text-green-400" size={20} />
              <h3 className="font-semibold text-theme-heading">Accepted</h3>
              <span className="text-xs bg-green-400/20 text-green-400 px-2 py-0.5 rounded-full">
                {pipelineColumns.accepted.length}
              </span>
            </div>
            <div className="space-y-2">
              {pipelineColumns.accepted.map((app) => (
                <Link
                  key={app.id}
                  href={`/jobs/${app.jobId}`}
                  className="block p-3 bg-theme-bg rounded-lg hover:bg-theme-border/50 transition-colors"
                >
                  <p className="text-sm font-medium text-theme-heading truncate">
                    {app.job?.title || "Job"}
                  </p>
                  <p className="text-xs text-theme-text mt-1">
                    {new Date(app.createdAt).toLocaleDateString()}
                  </p>
                </Link>
              ))}
              {pipelineColumns.accepted.length === 0 && (
                <p className="text-sm text-theme-text text-center py-4">No accepted yet</p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Send className="text-stellar-blue" size={20} />
              <h3 className="font-semibold text-theme-heading">In Progress</h3>
              <span className="text-xs bg-stellar-blue/20 text-stellar-blue px-2 py-0.5 rounded-full">
                {pipelineColumns.inProgress.length}
              </span>
            </div>
            <div className="space-y-2">
              {pipelineColumns.inProgress.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="block p-3 bg-theme-bg rounded-lg hover:bg-theme-border/50 transition-colors"
                >
                  <p className="text-sm font-medium text-theme-heading truncate">
                    {job.title}
                  </p>
                  <p className="text-xs text-theme-text mt-1">
                    {job.budget.toLocaleString()} XLM
                  </p>
                </Link>
              ))}
              {pipelineColumns.inProgress.length === 0 && (
                <p className="text-sm text-theme-text text-center py-4">No active work</p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="text-stellar-purple" size={20} />
              <h3 className="font-semibold text-theme-heading">Completed</h3>
              <span className="text-xs bg-stellar-purple/20 text-stellar-purple px-2 py-0.5 rounded-full">
                {pipelineColumns.completed.length}
              </span>
            </div>
            <div className="space-y-2">
              {pipelineColumns.completed.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="block p-3 bg-theme-bg rounded-lg hover:bg-theme-border/50 transition-colors"
                >
                  <p className="text-sm font-medium text-theme-heading truncate">
                    {job.title}
                  </p>
                  <p className="text-xs text-theme-text mt-1">
                    {job.budget.toLocaleString()} XLM
                  </p>
                </Link>
              ))}
              {pipelineColumns.completed.length === 0 && (
                <p className="text-sm text-theme-text text-center py-4">No completed</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Freelancer Applications */}
      {!isClient && activeTab === "My Applications" && (
        <div className="space-y-4">
          {appsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-stellar-blue" size={32} />
            </div>
          ) : applications.length === 0 ? (
            <div className="card text-center py-12">
              <FileText className="mx-auto text-theme-text mb-4" size={40} />
              <h3 className="text-lg font-semibold text-theme-heading mb-2">No applications yet</h3>
              <p className="text-theme-text text-sm">
                Browse open jobs and submit your first application.
              </p>
            </div>
          ) : (
            applications.map((app) => (
              <div key={app.id} className="card flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-theme-heading truncate">
                    {(app as Application & { job?: { title?: string } }).job?.title ?? "Job"}
                  </h3>
                  <p className="text-sm text-theme-text">
                    Applied: {new Date(app.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={app.status} />
                  {app.status === "PENDING" && (
                    <button
                      onClick={() => setWithdrawConfirmId(app.id)}
                      disabled={withdrawingId === app.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-theme-error/50 text-theme-error hover:bg-theme-error/10 transition-colors disabled:opacity-50"
                      title="Withdraw application"
                    >
                      {withdrawingId === app.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                      Withdraw
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Withdraw confirmation dialog */}
      {withdrawConfirmId && (() => {
        const app = applications.find((a) => a.id === withdrawConfirmId);
        const jobTitle = (app as Application & { job?: { title?: string } } | undefined)?.job?.title ?? "this job";
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-theme-card border border-theme-border rounded-xl shadow-2xl w-full max-w-md p-6">
              <h2 className="text-lg font-semibold text-theme-heading mb-2">
                Withdraw Application?
              </h2>
              <p className="text-sm text-theme-text mb-6">
                Withdraw your application for{" "}
                <span className="font-medium text-theme-heading">{jobTitle}</span>?
                This cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setWithdrawConfirmId(null)}
                  className="btn-secondary"
                  disabled={!!withdrawingId}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleWithdraw(withdrawConfirmId)}
                  disabled={!!withdrawingId}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-theme-error text-white text-sm font-medium hover:bg-theme-error/90 transition-colors disabled:opacity-50"
                >
                  {withdrawingId ? <Loader2 size={14} className="animate-spin" /> : null}
                  Withdraw
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Freelancer Applications */}
      {!isClient && activeTab === "My Applications" && (
        <div className="space-y-4">
          {appsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-stellar-blue" size={32} />
            </div>
          ) : applications.length === 0 ? (
            <div className="card text-center py-12">
              <FileText className="mx-auto text-theme-text mb-4" size={40} />
              <h3 className="text-lg font-semibold text-theme-heading mb-2">No applications yet</h3>
              <p className="text-theme-text text-sm mb-4">
                Browse open jobs and submit your first application.
              </p>
              <Link href="/jobs" className="btn-primary inline-block">
                Browse Jobs
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-theme-border">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-theme-heading">Job Title</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-theme-heading">Budget</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-theme-heading">Applied</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-theme-heading">Status</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-theme-heading">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => (
                    <tr key={app.id} className="border-b border-theme-border hover:bg-theme-card/50">
                      <td className="py-3 px-4">
                        <Link
                          href={`/jobs/${app.jobId}`}
                          className="font-medium text-theme-heading hover:text-stellar-blue"
                        >
                          {app.job?.title || "Job"}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-sm text-theme-text">
                        {app.bidAmount.toLocaleString()} XLM
                      </td>
                      <td className="py-3 px-4 text-sm text-theme-text">
                        {new Date(app.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={app.status} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/jobs/${app.jobId}`}
                            className="p-2 rounded-lg text-theme-text hover:text-stellar-blue hover:bg-theme-border/50 transition-colors"
                            title="View job"
                          >
                            <Eye size={16} />
                          </Link>
                          {app.status === "PENDING" && (
                            <button
                              onClick={() => setWithdrawConfirmId(app.id)}
                              disabled={withdrawingId === app.id}
                              className="p-2 rounded-lg text-theme-error hover:bg-theme-error/10 transition-colors disabled:opacity-50"
                              title="Withdraw application"
                            >
                              {withdrawingId === app.id ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Withdraw confirmation dialog */}
      {withdrawConfirmId && (() => {
        const app = applications.find((a) => a.id === withdrawConfirmId);
        const jobTitle = app?.job?.title ?? "this job";
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-theme-card border border-theme-border rounded-xl shadow-2xl w-full max-w-md p-6">
              <h2 className="text-lg font-semibold text-theme-heading mb-2">
                Withdraw Application?
              </h2>
              <p className="text-sm text-theme-text mb-6">
                Withdraw your application for{" "}
                <span className="font-medium text-theme-heading">{jobTitle}</span>?
                This cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setWithdrawConfirmId(null)}
                  className="btn-secondary"
                  disabled={!!withdrawingId}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleWithdraw(withdrawConfirmId)}
                  disabled={!!withdrawingId}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-theme-error text-white text-sm font-medium hover:bg-theme-error/90 transition-colors disabled:opacity-50"
                >
                  {withdrawingId ? <Loader2 size={14} className="animate-spin" /> : null}
                  Withdraw
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Client Posted Jobs */}
      {isClient && activeTab === "My Posted Jobs" && (
        <div className="space-y-4">
          {jobsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-stellar-blue" size={32} />
            </div>
          ) : clientJobsGrouped.open.length + clientJobsGrouped.inProgress.length === 0 ? (
            <div className="card text-center py-12">
              <Briefcase className="mx-auto text-theme-text mb-4" size={40} />
              <h3 className="text-lg font-semibold text-theme-heading mb-2">No jobs posted</h3>
              <p className="text-theme-text text-sm mb-4">
                Post your first job to find talented freelancers.
              </p>
              <Link href="/post-job" className="btn-primary inline-block">
                Post a Job
              </Link>
            </div>
          ) : (
            [...clientJobsGrouped.open, ...clientJobsGrouped.inProgress].map((job) => (
              <div key={job.id} className="card">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <Link
                      href={`/jobs/${job.id}`}
                      className="text-lg font-semibold text-theme-heading hover:text-stellar-blue flex items-center gap-2"
                    >
                      {job.title}
                      <ChevronRight size={18} />
                    </Link>
                    <div className="flex items-center gap-4 mt-2 text-sm text-theme-text">
                      <span>{job.budget.toLocaleString()} XLM</span>
                      <span>{job._count?.applications || 0} applicants</span>
                      <StatusBadge status={job.status} />
                    </div>
                  </div>
                </div>
                {job.milestones && job.milestones.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-theme-text">Milestone Progress</span>
                      <span className="text-sm text-theme-text">{getMilestoneProgress(job.milestones)}%</span>
                    </div>
                    <div className="w-full bg-theme-border rounded-full h-2">
                      <div
                        className="bg-stellar-blue rounded-full h-2 transition-all"
                        style={{ width: `${getMilestoneProgress(job.milestones)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Client Applicants Review */}
      {isClient && activeTab === "Applicants to Review" && (
        <div className="space-y-4">
          {applicantsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-stellar-blue" size={32} />
            </div>
          ) : pendingApplicants.length === 0 ? (
            <div className="card text-center py-12">
              <FileText className="mx-auto text-theme-text mb-4" size={40} />
              <h3 className="text-lg font-semibold text-theme-heading mb-2">No pending applicants</h3>
              <p className="text-theme-text text-sm">
                Applications for your jobs will appear here.
              </p>
            </div>
          ) : (
            pendingApplicants.map((app) => (
              <div key={app.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Link
                        href={`/profile/${app.freelancer.id}`}
                        className="font-semibold text-theme-heading hover:text-stellar-blue"
                      >
                        {app.freelancer.username}
                      </Link>
                      <span className="text-sm text-theme-text">applied for</span>
                      <Link
                        href={`/jobs/${app.jobId}`}
                        className="text-sm text-stellar-blue hover:underline"
                      >
                        {app.job?.title || "Job"}
                      </Link>
                    </div>
                    <p className="text-sm text-theme-text mb-2">
                      Proposed Budget: <span className="font-medium text-stellar-purple">{app.bidAmount.toLocaleString()} XLM</span>
                    </p>
                    <p className="text-sm text-theme-text line-clamp-2">
                      {app.proposal}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleApplicationAction(app.id, "REJECTED")}
                      disabled={actioningId === app.id}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-theme-error/50 text-theme-error hover:bg-theme-error/10 transition-colors disabled:opacity-50"
                    >
                      {actioningId === app.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <XCircle size={16} />
                      )}
                      Reject
                    </button>
                    <button
                      onClick={() => handleApplicationAction(app.id, "ACCEPTED")}
                      disabled={actioningId === app.id}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-stellar-blue text-white hover:bg-stellar-blue/90 transition-colors disabled:opacity-50"
                    >
                      {actioningId === app.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      Accept
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
