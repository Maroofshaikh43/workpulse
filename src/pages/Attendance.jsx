import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { formatLongDate, formatTime, getToday } from "../utils";

function getDistance(lat1, lng1, lat2, lng2) {
  const earthRadius = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

export default function Attendance() {
  const { supabase, profile } = useOutletContext();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [registeredPhotoUrl, setRegisteredPhotoUrl] = useState("");
  const [companyConfig, setCompanyConfig] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState("");
  const [location, setLocation] = useState(null);
  const [distance, setDistance] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [action, setAction] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [attendanceState, setAttendanceState] = useState("not_checked_in");

  const attendanceRadius = companyConfig?.attendance_radius_meters ?? 200;
  const officeReady = useMemo(
    () =>
      companyConfig?.office_lat !== null &&
      companyConfig?.office_lng !== null &&
      companyConfig?.office_lat !== undefined &&
      companyConfig?.office_lng !== undefined,
    [companyConfig],
  );

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  const resetSelfie = () => {
    stopCamera();
    setSelfiePreview("");
  };

  const fetchAttendancePageData = async () => {
    if (!profile?.id || !profile?.company_id) return;

    setPageLoading(true);

    const today = getToday();
    const [
      { data: attendanceData, error: attendanceError },
      { data: userData, error: userError },
      { data: freshCompany, error: companyError },
    ] = await Promise.all([
      supabase.from("attendance").select("*").eq("user_id", profile.id).eq("date", today).maybeSingle(),
      supabase.from("users").select("profile_photo_url").eq("id", profile.id).single(),
      supabase
        .from("companies")
        .select("office_lat, office_lng, attendance_radius_meters, status")
        .eq("id", profile.company_id)
        .single(),
    ]);

    if (attendanceError || userError || companyError) {
      setError(attendanceError?.message || userError?.message || companyError?.message || "Unable to load attendance data.");
      setPageLoading(false);
      return null;
    }

    setTodayAttendance(attendanceData ?? null);
    setRegisteredPhotoUrl(userData?.profile_photo_url ?? "");
    setCompanyConfig(freshCompany ?? null);

    if (attendanceData?.check_in_time && attendanceData?.check_out_time) {
      setAttendanceState("completed");
    } else if (attendanceData?.check_in_time && !attendanceData?.check_out_time) {
      setAttendanceState("checked_in");
    } else {
      setAttendanceState("not_checked_in");
    }

    setPageLoading(false);
    return {
      attendance: attendanceData ?? null,
      profilePhotoUrl: userData?.profile_photo_url ?? "",
      company: freshCompany ?? null,
    };
  };

  useEffect(() => {
    fetchAttendancePageData();
    return () => stopCamera();
  }, [profile?.id, profile?.company_id]);

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOpen]);

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch (cameraError) {
      setError(
        cameraError?.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access to continue."
          : `Camera access failed: ${cameraError.message}`,
      );
    }
  };

  const captureSelfie = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const context = canvas.getContext("2d");
    context.drawImage(videoRef.current, 0, 0);
    setSelfiePreview(canvas.toDataURL("image/png"));
    stopCamera();
  };

  const verifyLocation = async () => {
    setError("");
    setMessage("");
    resetSelfie();

    if (!registeredPhotoUrl) {
      setError("Please upload profile photo in Profile settings before checking in");
      return;
    }

    const freshData = await fetchAttendancePageData();
    const nextCompany = freshData?.company ?? companyConfig;

    if (
      !nextCompany ||
      nextCompany.office_lat === null ||
      nextCompany.office_lat === undefined ||
      nextCompany.office_lng === null ||
      nextCompany.office_lng === undefined
    ) {
      setError(
        "Your admin has not set the office location yet. Please contact your admin to set the office GPS coordinates in Company Settings.",
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        const nextDistance = getDistance(
          nextLocation.lat,
          nextLocation.lng,
          nextCompany.office_lat,
          nextCompany.office_lng,
        );

        setLocation(nextLocation);
        setDistance(nextDistance);

        if (nextDistance > attendanceRadius) {
          stopCamera();
          setError(`You are ${Math.round(nextDistance)}m away from office. Must be within ${attendanceRadius}m to check in.`);
          return;
        }

        setMessage(`GPS verified within ${Math.round(nextDistance)} meters. Camera unlocked.`);
        await openCamera();
      },
      (geoError) => setError(`Location access failed: ${geoError.message}`),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleCheckIn = async () => {
    setError("");
    setMessage("");

    if (!registeredPhotoUrl) {
      setError("Please upload profile photo in Profile settings before checking in");
      return;
    }

    if (!location || distance === null || distance > attendanceRadius) {
      setError("Verify GPS successfully before checking in.");
      return;
    }

    if (!selfiePreview) {
      setError("Capture a live selfie after GPS verification.");
      return;
    }

    if (attendanceState !== "not_checked_in") {
      setError("You have already checked in for today.");
      return;
    }

    setLoading(true);
    setAction("checkin");
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    const status = time > "09:30:00" ? "late" : "present";

    const { error: insertError } = await supabase.from("attendance").upsert(
      {
        user_id: profile.id,
        company_id: profile.company_id,
        date: getToday(),
        check_in_time: time,
        location_lat: location.lat,
        location_lng: location.lng,
        face_verified: true,
        status,
      },
      { onConflict: "user_id,date" },
    );

    setLoading(false);
    setAction("");

    if (insertError) {
      setError(insertError.message);
      return;
    }

    resetSelfie();
    setMessage(`Attendance marked successfully at ${formatTime(time)}.`);
    await fetchAttendancePageData();
  };

  const handleCheckOut = async () => {
    const { data: reportSubmission } = await supabase
      .from("daily_report_submissions")
      .select("id")
      .eq("user_id", profile.id)
      .eq("date", getToday())
      .maybeSingle();

    if (!reportSubmission) {
      setError("Complete today's daily report before checking out.");
      return;
    }

    setLoading(true);
    setAction("checkout");
    setError("");
    setMessage("");
    const now = new Date();
    const checkoutTime = now.toTimeString().slice(0, 8);
    const { error: updateError } = await supabase
      .from("attendance")
      .update({ check_out_time: checkoutTime })
      .eq("user_id", profile.id)
      .eq("date", getToday());

    setLoading(false);
    setAction("");

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage(`Check-out recorded successfully at ${formatTime(checkoutTime)}.`);
    await fetchAttendancePageData();
  };

  if (pageLoading) {
    return <section className="panel empty-state">Loading attendance...</section>;
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="section-header">
          <h2>Attendance</h2>
          <p>{formatLongDate()}.</p>
        </div>
        {!!error && <div className="alert error">{error}</div>}
        {!!message && <div className="alert success">{message}</div>}
        <div className="stat-grid">
          <div className="stat-card">
            <span>Today</span>
            <strong>{attendanceState === "completed" ? "Completed" : todayAttendance?.status ?? "Not marked"}</strong>
          </div>
          <div className="stat-card">
            <span>Check In</span>
            <strong>{formatTime(todayAttendance?.check_in_time)}</strong>
          </div>
          <div className="stat-card">
            <span>Check Out</span>
            <strong>{formatTime(todayAttendance?.check_out_time)}</strong>
          </div>
          <div className="stat-card">
            <span>Allowed Radius</span>
            <strong>{attendanceRadius}m</strong>
          </div>
        </div>
      </div>

      <div className="grid-two responsive">
        <div className="panel">
          <div className="section-header">
            <h3>Step 1: GPS Verification</h3>
            <p>Verify your current location to unlock the selfie check-in flow.</p>
          </div>
          <div className="stack">
            <div className="mini-card">
              <strong>Today's Date</strong>
              <p>{formatLongDate()}</p>
            </div>
            {attendanceState === "checked_in" ? (
              <div className="mini-card">
                <strong>Already checked in</strong>
                <p>You checked in at {formatTime(todayAttendance?.check_in_time)}</p>
              </div>
            ) : null}
            {attendanceState === "completed" ? (
              <div className="mini-card">
                <strong>Attendance completed for today</strong>
                <p>Check in: {formatTime(todayAttendance?.check_in_time)}</p>
                <p>Check out: {formatTime(todayAttendance?.check_out_time)}</p>
                <p>See you tomorrow!</p>
              </div>
            ) : null}
            <div className="mini-card">
              <strong>Your registered face</strong>
              {registeredPhotoUrl ? (
                <img src={registeredPhotoUrl} alt="Your registered face" className="photo-preview comparison-photo" />
              ) : (
                <p>Please upload profile photo in Profile settings before checking in</p>
              )}
            </div>
            {attendanceState === "not_checked_in" ? (
              <button type="button" className="primary-button" onClick={verifyLocation}>
                Verify GPS & Unlock Camera
              </button>
            ) : null}
            {location && (
              <div className="mini-card">
                <p>
                  Current location: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                </p>
                {distance !== null && <p>Distance from office: {Math.round(distance)} meters</p>}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>Step 2: Face Comparison</h3>
            <p>Compare your registered photo with a live selfie before final check-in.</p>
          </div>

          {!cameraOpen && !selfiePreview && attendanceState === "not_checked_in" && (
            <div className="empty-state">
              Camera stays locked until GPS verification succeeds inside the office radius.
            </div>
          )}

          {cameraOpen && (
            <div className="camera-card">
              <video ref={videoRef} autoPlay playsInline className="camera-view" />
              <div className="row-end">
                <button type="button" className="ghost-button" onClick={stopCamera}>
                  Cancel
                </button>
                <button type="button" className="primary-button" onClick={captureSelfie}>
                  Capture Selfie
                </button>
              </div>
            </div>
          )}

          {selfiePreview && (
            <div className="stack">
              <div className="comparison-grid">
                <div className="mini-card">
                  <strong>Registered</strong>
                  <img src={registeredPhotoUrl} alt="Registered photo" className="photo-preview comparison-photo" />
                </div>
                <div className="mini-card">
                  <strong>Live Selfie</strong>
                  <img src={selfiePreview} alt="Live selfie" className="photo-preview comparison-photo" />
                </div>
              </div>
              <div className="row-end">
                <button type="button" className="ghost-button" onClick={resetSelfie}>
                  Retake Selfie
                </button>
                <button type="button" className="success-button" onClick={handleCheckIn} disabled={loading}>
                  {loading && action === "checkin" ? "Saving..." : "Yes, it's me - Check In"}
                </button>
              </div>
            </div>
          )}

          {attendanceState === "checked_in" ? (
            <div className="row-end">
              <button
                type="button"
                className="ghost-button"
                onClick={handleCheckOut}
                disabled={loading || !todayAttendance?.check_in_time}
              >
                {loading && action === "checkout" ? "Checking out..." : "Check Out"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
