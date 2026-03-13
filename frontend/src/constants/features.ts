import {
    ChartColumnBigIcon,
    DatabaseIcon,
    TrendingUpIcon,
    WandSparklesIcon,
    ZapIcon
} from "lucide-react";

export const FEATURES = [
    {
        title: "Company Search",
        description: "Search companies by name and retrieve employee lists from trusted sources (Hunter, Apollo, LinkedIn).",
        icon: WandSparklesIcon,
        image: "/images/feature-two.svg",
    },
    {
        title: "Email Discovery",
        description: "Automatically generate and discover business email candidates using enrichment APIs and pattern heuristics.",
        icon: ChartColumnBigIcon,
        image: "/images/feature-one.svg",
    },
    {
        title: "Role Filtering",
        description: "Filter results to target decision-makers (CTO, VP, Director, Manager) with fuzzy title matching.",
        icon: DatabaseIcon,
        image: "/images/feature-three.svg",
    },
    {
        title: "Bulk Company Search",
        description: "Submit multiple companies at once; pipeline runs parallel searches and aggregates per-company results.",
        icon: TrendingUpIcon,
        image: "/images/feature-four.svg",
    },
    {
        title: "Email Verification",
        description: "Verify discovered emails with MX/SMTP and disposable checks so you export high-quality, deliverable contacts.",
        icon: ZapIcon,
        image: "/images/feature-five.svg",
    }
]