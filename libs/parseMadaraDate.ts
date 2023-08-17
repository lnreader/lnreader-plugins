import dayjs from "dayjs";

export const parseMadaraDate = (date: string) => {
    if (date.includes("ago")) {
        const dayJSDate = dayjs(new Date()); // today
        const timeAgo = date.match(/\d+/)?.[0] || "";
        const timeAgoInt = parseInt(timeAgo, 10);

        if (!timeAgo) return date; // there is no number!

        if (date.includes("hours ago") || date.includes("hour ago")) {
            dayJSDate.subtract(timeAgoInt, "hours"); // go back N hours
        }

        if (date.includes("days ago") || date.includes("day ago")) {
            dayJSDate.subtract(timeAgoInt, "days"); // go back N days
        }

        if (date.includes("months ago") || date.includes("month ago")) {
            dayJSDate.subtract(timeAgoInt, "months"); // go back N months
        }

        return dayJSDate.format("LL");
    }
    return date; // there is no "ago" so don't mess with the date
};
