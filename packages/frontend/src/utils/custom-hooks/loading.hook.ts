import { useCallback, useState } from "react";
import toast from "react-hot-toast";

export function useIsLoading<T = any>(callback: () => Promise<T>) {
  const [isLoading, setIsLoading] = useState(false);

  const request = useCallback(async () => {
    setIsLoading(true);
    try {
      await callback();
      setIsLoading(false);
    } catch (error: any) {
      toast.error("Algo não ocorreu como deveria!");
      console.log(
        "error: ",
        error.status?.toString() ?? error,
        error.response?.data
      );
      setIsLoading(false);
    }
  }, [callback]);

  return { isLoading, request };
}
