import React, { useEffect, useState } from 'react';
import { getJobs } from '../../lib/api/presidio';
import PageTransition from "../../components/PageTransition";
import Skeleton from "../../components/Skeleton";

export default function Audit() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchJobs() {
            try {
                const data = await getJobs();
                setJobs(data);
            } catch (err) {
                setError("Failed to load audit log");
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        fetchJobs();
    }, []);

    if (error) {
        return (
            <div className="flex h-64 items-center justify-center text-red-400">
                {error}
            </div>
        );
    }

    return (
        <PageTransition>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-white">Audit Log</h2>
                    {loading ? (
                        <Skeleton className="h-6 w-20 rounded-full" />
                    ) : (
                        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/70">
                            {jobs.length} Records
                        </span>
                    )}
                </div>

                <div className="overflow-hidden rounded-2xl border border-white/10 bg-base-900/50">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-white/70">
                            <thead className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-wider text-white/50">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Date</th>
                                    <th className="px-6 py-4 font-medium">Source</th>
                                    <th className="px-6 py-4 font-medium">Technique</th>
                                    <th className="px-6 py-4 font-medium">Entities</th>
                                    <th className="px-6 py-4 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {loading ? (
                                    // Skeleton rows
                                    [...Array(5)].map((_, i) => (
                                        <tr key={i}>
                                            <td className="px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                                            <td className="px-6 py-4"><Skeleton className="h-4 w-32" /></td>
                                            <td className="px-6 py-4"><Skeleton className="h-6 w-16 rounded-md" /></td>
                                            <td className="px-6 py-4"><Skeleton className="h-4 w-8" /></td>
                                            <td className="px-6 py-4"><Skeleton className="h-6 w-20 rounded-md" /></td>
                                        </tr>
                                    ))
                                ) : jobs.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-12 text-center text-white/40">
                                            No anonymization jobs found
                                        </td>
                                    </tr>
                                ) : (
                                    jobs.map((job) => (
                                        <tr key={job.id} className="hover:bg-white/5 transition-colors">
                                            <td className="whitespace-nowrap px-6 py-4">
                                                {new Date(job.created_at).toLocaleDateString()}
                                                <span className="block text-xs text-white/40">
                                                    {new Date(job.created_at).toLocaleTimeString()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="font-medium text-white">{job.source}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="inline-flex items-center rounded-md bg-blue-400/10 px-2 py-1 text-xs font-medium text-blue-400 ring-1 ring-inset ring-blue-400/20">
                                                    {job.technique}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">{job.entity_count}</td>
                                            <td className="px-6 py-4">
                                                <span
                                                    className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${job.status === 'success'
                                                        ? 'bg-green-400/10 text-green-400 ring-green-400/20'
                                                        : 'bg-red-400/10 text-red-400 ring-red-400/20'
                                                        }`}
                                                >
                                                    {job.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </PageTransition>
    );
}
