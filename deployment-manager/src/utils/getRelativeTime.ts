export default function getRelativeTime(date: string | Date) {
  // Fail early if no date is provided
  if (!date) {
    return '';
  }

  // If date passed is not a Date object, convert it to a Date object
  if (!(date instanceof Date)) {
    date = new Date(date);
  }

  // Calculate the difference in seconds between the date and now
  const diffInSeconds = Math.abs(Math.floor((date.getTime() - Date.now()) / 1000));

  // Define time intervals in seconds
  const minute = 60;
  const hour = minute * 60;
  const day = hour * 24;
  const month = day * 30;
  const year = month * 12;

  // If difference is less than 1 minute, return "just now"
  if (diffInSeconds < minute) {
    return 'just now';
  }

  // If difference is less than 1 hour, return the number of minutes
  if (diffInSeconds < hour) {
    const minutes = Math.floor(diffInSeconds / minute);
    return `${minutes}m ago`;
  }

  // If difference is less than 1 day, return the number of hours
  if (diffInSeconds < day) {
    const hours = Math.floor(diffInSeconds / hour);
    return `${hours}h ago`;
  }

  // If difference is less than 1 month, return the number of days
  if (diffInSeconds < month) {
    const days = Math.floor(diffInSeconds / day);
    return `${days}d ago`;
  }

  // If difference is less than 1 year, return the number of months
  if (diffInSeconds < year) {
    const months = Math.floor(diffInSeconds / month);
    return `${months}mo ago`;
  }

  // If difference is 1 year or more, return the number of years
  const years = Math.floor(diffInSeconds / year);
  return `${years}y ago`;
}