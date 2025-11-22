export default function Skeleton({ className = "" }) {
    return (
        <div
            className={`animate-pulse rounded-md bg-white/10 ${className}`}
        />
    );
}
