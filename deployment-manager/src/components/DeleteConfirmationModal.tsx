interface DeleteConfirmationModalProps {
  appName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteConfirmationModal({
  appName,
  onConfirm,
  onCancel,
}: DeleteConfirmationModalProps) {
  return (
    <div className="space-y-4">
      <p className="text-gray-700">
        Are you sure you want to delete the app "{appName}"? This action cannot be undone.
      </p>
      
      <div className="flex justify-end space-x-3 pt-4">
        <button
          onClick={onConfirm}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
        >
          Delete App
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}