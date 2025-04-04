interface UserAvatarProps {
  name: string;
  className?: string;
}

export default function UserAvatar({ name, className = '' }: UserAvatarProps) {
  const initial = name.charAt(0).toUpperCase();
  
  return (
    <div className={`
      w-8 h-8 
      rounded-full 
      bg-blue-500 
      text-white 
      flex 
      items-center 
      justify-center 
      font-semibold
      ${className}
    `}>
      {initial}
    </div>
  );
} 